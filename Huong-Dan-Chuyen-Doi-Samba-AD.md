# Hướng dẫn Chuyển đổi Windows Server 2016 DC sang Samba AD trên Proxmox

**Mục tiêu:**
- 1 VM Samba AD DC trên Proxmox (chỉ làm nhiệm vụ xác thực Domain).
- Giữ nguyên domain cũ, user/group hiện tại.
- Máy trạm không cần gỡ domain (unjoin).
- File Share (data) chạy trên một VM/container khác trong Proxmox (tách biệt với DC).

---

## 1. Kiến trúc khuyến nghị trên Proxmox

- **VM1: Samba-AD-DC (Ubuntu 24.04 LTS)** — Chỉ làm Domain Controller + DNS.
- **VM2: File-Share (Ubuntu hoặc TrueNAS Scale)** — Lưu toàn bộ data, share SMB.
- **Client (Máy trạm):** Đã join domain từ trước → login và tự động map share từ VM2.

*(Lý do tách biệt: Samba team không khuyến nghị dùng DC làm File Server để đảm bảo hiệu suất và bảo mật tốt nhất).*

---

## 2. Chuẩn bị Proxmox cho Samba DC (VM1)

Tạo một máy ảo (VM) chạy Ubuntu 24.04 LTS cho Samba DC với cấu hình:
- **CPU:** 4 cores
- **RAM:** 8GB (tối thiểu 6GB)
- **Disk:** 32GB SSD
- **Network:** Static IP (ví dụ `192.168.1.10`)
- *(Tùy chọn)* Enable Nested Virtualization nếu cần.

Cài đặt cơ bản trên VM Samba sau khi cài xong hệ điều hành:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y chrony curl wget vim
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo hostnamectl set-hostname dc1.tenmien.vn
```

Mở file `/etc/hosts` và thêm dòng sau (thay bằng IP thực tế của bạn):
```text
192.168.1.10   dc1.tenmien.vn dc1
```

---

## 3. Cài đặt Samba AD DC (Join domain Windows 2016)

### Bước 1: Cài đặt gói phần mềm
```bash
sudo apt install -y samba smbclient winbind krb5-user libpam-krb5
```
Sau đó, xóa các file cấu hình mặc định (để tạo mới từ Active Directory):
```bash
sudo rm /etc/samba/smb.conf
sudo rm /etc/krb5.conf
```

### Bước 2: Join làm Domain Controller phụ
*Lưu ý: Thay `tenmien.vn` và `TENMIEN.VN` bằng tên domain thực tế của bạn.*
```bash
sudo samba-tool domain join tenmien.vn DC -U"Administrator@TENMIEN.VN" --dns-backend=SAMBA_INTERNAL
```

### Bước 3: Khởi động và kiểm tra
```bash
sudo systemctl restart smbd nmbd winbind samba-ad-dc
sudo samba-tool drs showrepl
```

### Bước 4: Chuyển toàn bộ quyền (FSMO Roles) sang Samba
```bash
sudo samba-tool fsmo transfer --role=all -U Administrator
```

---

## 4. Đồng bộ SYSVOL (Quan trọng nhất)

Samba chưa tự động đồng bộ SYSVOL với Windows Server. Bạn cần copy dữ liệu (Group Policy, scripts...) từ Windows sang Samba một lần.

**Trên Windows Server 2016 (chạy CMD quyền Admin):**
```cmd
robocopy "\\dc-samba\sysvol" "C:\Windows\SYSVOL\domain" /MIR /SEC /COPYALL
```
*(Đổi `\\dc-samba` thành tên hoặc IP của máy Samba DC).*

**Sau đó, trên máy Samba DC chạy lệnh:**
```bash
sudo samba-tool ntacl sysvolreset
```

---

## 5. Hạ cấp (Demote) Windows Server 2016

1. Hãy chắc chắn rằng bạn đã chuyển hết FSMO Roles sang Samba (đã làm ở Bước 3).
2. Trên Windows Server 2016: Mở **Server Manager** → **Manage** → **Remove Roles and Features** → Chọn bỏ **Active Directory Domain Services** và làm theo hướng dẫn để **Demote this domain controller**.
3. Sau khi hạ cấp xong, bạn có thể tắt hẳn máy ảo Windows Server này (hoặc giữ lại làm máy trạm bình thường nếu thích).

---

## 6. Cấu hình sau khi chuyển đổi

- Đổi DNS trên DHCP Server (hoặc trên từng máy trạm) trỏ Primary DNS về IP của máy Samba DC (`192.168.1.10`).
- Mở PowerShell trên máy trạm Windows để kiểm tra xem đã nhận DC mới chưa:
  ```powershell
  nltest /dsgetdc:tenmien.vn
  ```
- Khởi động lại máy trạm và đăng nhập thử.

---

## 7. Thiết lập Máy ảo File Share (VM2)

Tạo một máy ảo Ubuntu khác để chứa Data.

Cài đặt Samba:
```bash
sudo apt install samba
```

Sửa file cấu hình `/etc/samba/smb.conf`:
```ini
[Data]
   path = /mnt/data
   browseable = yes
   writable = yes
   valid users = "@Domain Users"
   force group = "Domain Users"
   create mask = 0664
   directory mask = 0775
```

Join VM File Share này vào domain của Samba DC (làm Member Server):
```bash
sudo net ads join -U Administrator
```

---

## 8. Lệnh kiểm tra thường dùng trên Samba DC

```bash
# Xem danh sách user trong Domain
samba-tool user list

# Xem danh sách Group trong Domain
samba-tool group list

# Xem máy chủ nào đang nắm giữ FSMO Roles
samba-tool fsmo show

# Kiểm tra trạng thái đồng bộ (Replication)
samba-tool drs showrepl
```

---

## 9. Xử lý xung đột DNS trên Ubuntu (Lỗi không tìm thấy Domain)

Khi cài Samba AD DC trên Ubuntu 24.04, dịch vụ `systemd-resolved` mặc định sẽ chiếm dụng cổng 53, làm cho DNS nội bộ của Samba bị lỗi `NT_STATUS_ADDRESS_ALREADY_ASSOCIATED`. Hệ quả là các máy trạm không thể Join Domain vì không phân giải được tên miền.

**Cách khắc phục trên Máy chủ Samba (VM1):**
```bash
# 1. Tắt dịch vụ mặc định của Ubuntu
sudo systemctl stop systemd-resolved
sudo systemctl disable systemd-resolved

# 2. Xóa symlink cũ và ép máy chủ dùng DNS cục bộ
sudo rm -f /etc/resolv.conf
sudo sh -c 'echo "nameserver 127.0.0.1" > /etc/resolv.conf'

# 3. Khởi động lại Samba để nó "nuốt" cổng 53
sudo systemctl restart samba-ad-dc

# 4. Kiểm tra xem DNS đã nhận chưa
host -t SRV _ldap._tcp.tenmien.vn 127.0.0.1
```

*Lưu ý cho Máy con (VM2): Nếu máy con mất mạng Internet khi tải file cài đặt (lỗi `archive.ubuntu.com`), hãy thêm tạm `nameserver 8.8.8.8` vào `/etc/resolv.conf` của máy con.*

---

## 10. Đưa ZaloCRM lên Máy chủ Ứng dụng (VM2)

**Bước 1:** Chuẩn bị Source Code từ máy Host (Windows)
Do lệnh `scp` thư mục `node_modules` rất chậm và hay lỗi, tốt nhất nên nén file ZIP lại:
```powershell
# Bật PowerShell ở máy Host Windows
tar.exe -czf ZaloCRM.tar.gz ZaloCRM
scp ZaloCRM.tar.gz user@<IP_VM2>:/home/user/
```

**Bước 2:** Cài đặt bằng file Script tự động (`setup-pm2.sh`)
```bash
# SSH vào VM2, giải nén code
tar -xzf ZaloCRM.tar.gz
cd ZaloCRM

# Chạy script tự động (Tự cài Nodejs, Postgres, Redis, PM2, Nginx)
chmod +x setup-pm2.sh
./setup-pm2.sh
```

**Lưu ý quan trọng cho PM2 & `.env`:**
PM2 mặc định sẽ không tự đọc file `.env`. Nếu API báo lỗi `DATABASE_URL not set`, nguyên nhân là do PM2 không nạp cấu hình. Cách xử lý triệt để trong Node 20 là chạy bằng tham số `--env-file`:
```bash
pm2 delete zalocrm-api
NODE_ENV=production pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"
pm2 save --force
```

**Lưu ý quan trọng cho Nginx & Websocket:**
Websocket (Socket.io) bắt buộc phải được cấu hình `proxy_pass` kèm header `Upgrade` nếu không mã QR Zalo sẽ không thể hiển thị và API bị báo lỗi **429 Too Many Requests**. (Đã được cập nhật tự động trong script `setup-pm2.sh`).

**Tự động hóa khởi động máy chủ (Auto-start on boot):**
Để hệ thống ZaloCRM tự động "thức dậy" mỗi khi máy ảo (VM2) được bật lên hoặc sau sự cố mất điện, chạy lệnh sau:
```bash
pm2 startup
```
*Copy lệnh sinh ra bắt đầu bằng `sudo env PATH...` và dán xuống chạy.* Sau đó, gõ:
```bash
pm2 save
```

---

## 11. Dựng Máy trạm Client (VM3) mô phỏng người dùng

Để kịch bản hoàn hảo nhất, hãy tạo thêm Máy ảo Windows 10/11 trên VirtualBox:
1. **Network:** Đặt là `Bridged Adapter` để cùng dải mạng `192.168.0.x`.
2. **DNS:** Vào IPv4 cấu hình DNS trỏ thẳng về IP của Máy chủ DC (VM1).
3. **Join Domain:** Vào `System Properties` -> `Change Domain` -> Gõ tên miền (VD: `cuongnh.testdomain`) -> Nhập tài khoản Administrator.
4. **Sử dụng:** Đăng nhập bằng tài khoản Domain User, mở trình duyệt truy cập vào IP của Máy chủ Ứng dụng (VM2) để dùng ZaloCRM.

---

## 12. Hướng dẫn thiết lập File Share dùng chung qua Domain và GPO

Dưới đây là chi tiết các bước cấu hình, tham số và câu lệnh đã thực thi thành công để dựng hệ thống ổ đĩa mạng dùng chung phân quyền theo Active Directory.

### Bước 1: Khắc phục xung đột dịch vụ trên Domain Controller (VM1 - 192.168.0.112)
Samba AD DC có cơ chế tự lắng nghe cổng `445` (RPC over SMB). Tuyệt đối không được chạy dịch vụ `smbd`, `nmbd`, và `winbind` riêng lẻ trên máy chủ DC. Chạy cụm lệnh sau để tắt và khóa các dịch vụ này:
```bash
sudo systemctl stop smbd nmbd winbind
sudo systemctl disable smbd nmbd winbind
sudo systemctl mask smbd nmbd winbind
sudo systemctl restart samba-ad-dc
```

### Bước 2: Cài đặt và cấu hình File Server (VM2 - 192.168.0.97)
1. **Cài đặt các gói phần mềm cần thiết:**
   ```bash
   sudo apt update
   sudo apt install -y samba winbind libnss-winbind libpam-winbind krb5-user
   ```
   *(Trong quá trình cài đặt, khi bảng cấu hình Kerberos hiện lên, nhập Realm: `CUONGNH.TESTDOMAIN`, máy chủ Kerberos và Admin server: `dc1.cuongnh.testdomain`)*

2. **Cấu hình mạng tạm thời để phân giải DNS của Domain:**
   ```bash
   sudo sh -c 'echo -e "nameserver 192.168.0.112\nnameserver 8.8.8.8" > /etc/resolv.conf'
   ```

3. **Cấu hình Kerberos (`/etc/krb5.conf`):**
   ```ini
   [libdefaults]
       default_realm = CUONGNH.TESTDOMAIN
       dns_lookup_realm = false
       dns_lookup_kdc = true
   ```

4. **Cấu hình Samba (`/etc/samba/smb.conf`):**
   ```ini
   [global]
      workgroup = CUONGNH
      security = ADS
      realm = CUONGNH.TESTDOMAIN
      winbind use default domain = yes
      winbind offline logon = yes
      
      idmap config * : backend = tdb
      idmap config * : range = 3000-7999
      idmap config CUONGNH : backend = rid
      idmap config CUONGNH : range = 10000-999999
      template shell = /bin/bash

   [DuLieuChung]
      path = /mnt/data
      browseable = yes
      writable = yes
      read only = no
      valid users = "@Domain Users"
      force group = "Domain Users"
      create mask = 0660
      directory mask = 0770
   ```

5. **Tạo thư mục lưu trữ dữ liệu chia sẻ:**
   ```bash
   sudo mkdir -p /mnt/data
   ```

6. **Khai báo cứng DNS để vượt lỗi RPC Join Domain:**
   Samba trên máy chủ Linux khi Join đôi lúc gặp lỗi `getaddrinfo` không thể phân giải hostname chữ của máy AD. Chạy lệnh sau để thêm IP tĩnh vào `/etc/hosts`:
   ```bash
   sudo sh -c 'echo "192.168.0.112 dc1.cuongnh.testdomain dc1" >> /etc/hosts'
   ```

7. **Gia nhập Domain (Join Domain):**
   Chạy lệnh kết nối trực tiếp không qua cập nhật động DNS:
   ```bash
   sudo net ads join -U Administrator -S dc1.cuongnh.testdomain --no-dns-updates
   # Mật khẩu tài khoản: Qvc@1011
   ```

8. **Cấu hình cơ chế định danh hệ thống (`/etc/nsswitch.conf`):**
   Mở file `/etc/nsswitch.conf` và thêm `winbind` vào cuối 2 dòng `passwd:` và `group:` để Linux nhận dạng được User/Group của Domain:
   ```text
   passwd:         files systemd winbind
   group:          files systemd winbind
   ```

9. **Kích hoạt dịch vụ Winbind và phân quyền truy cập:**
   ```bash
   # Khởi động lại Winbind cập nhật nsswitch
   sudo systemctl restart winbind
   
   # Phân quyền sở hữu thư mục cho nhóm quản trị Domain Users
   sudo chown -R "root":"Domain Users" /mnt/data
   sudo chmod -R 770 /mnt/data
   ```

### Bước 3: Cấu hình Group Policy Object (GPO) tự động ánh xạ ổ đĩa
Thực hiện trên máy ảo quản trị Windows hoặc công cụ quản trị AD của Domain Controller:
1. Mở **Group Policy Management** (`gpmc.msc`).
2. Chuột phải vào tên Domain chọn **Create a GPO in this domain, and Link it here...**, đặt tên là `Auto-Map-Shared-Drive`.
3. Chuột phải vào GPO vừa tạo -> chọn **Edit**.
4. Truy cập theo đường dẫn:
   `User Configuration` -> `Preferences` -> `Windows Settings` -> `Drive Maps`.
5. Chuột phải vào vùng trống bên phải chọn **New** -> **Mapped Drive**.
6. Cấu hình các thông số chi tiết:
   *   **Action:** `Update`
   *   **Location:** `\\192.168.0.97\DuLieuChung`
   *   **Reconnect:** Tích chọn (Có)
   *   **Label as:** `Dữ Liệu Công Ty`
   *   **Use:** Chọn ký tự ổ mạng là **Z:**
7. Bấm **Apply** -> **OK** để lưu lại.
8. Trên các máy trạm Windows Client, mở **CMD** gõ lệnh sau để cập nhật chính sách ngay lập tức:
   ```cmd
   gpupdate /force
   ```

---
*Văn bản này được tự động tạo dựa trên yêu cầu của bạn. Bạn có thể lưu lại và sử dụng làm tài liệu tham khảo chính thức trong quá trình triển khai hệ thống nội bộ.*
