# Hướng dẫn Chuyển đổi Windows Server 2016 DC sang Samba AD trên Proxmox

**Mục tiêu:**
- 1 VM Samba AD DC trên Proxmox (chỉ làm Domain Controller + DNS)
- 1 VM File Share/ứng dụng riêng biệt
- Giữ nguyên domain cũ, user/group hiện tại
- Máy trạm không cần unjoin domain

---

## 1. Kiến trúc đề xuất

- **VM1: Samba AD DC (Ubuntu 24.04 LTS)** — Domain Controller + DNS
- **VM2: File Share / Ứng dụng** — lưu data và chia sẻ SMB
- **Client:** Giữ nguyên domain, đăng nhập bình thường

---

## 2. Chuẩn bị Samba AD DC (VM1)

1. Tạo VM Ubuntu 24.04, set static IP, hostname và timezone.
2. Cài đặt:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y chrony curl wget vim samba smbclient winbind krb5-user libpam-krb5
```
3. Cấu hình cơ bản:
```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo hostnamectl set-hostname dc1.tenmien.vn
sudo sh -c 'echo "192.168.1.10 dc1.tenmien.vn dc1" >> /etc/hosts'
```

---

## 3. Gia nhập Samba vào domain Windows

1. Xoá cấu hình Samba/AWS cũ:
```bash
sudo rm -f /etc/samba/smb.conf /etc/krb5.conf
```
2. Join làm Domain Controller phụ:
```bash
sudo samba-tool domain join tenmien.vn DC -U"Administrator@TENMIEN.VN" --dns-backend=SAMBA_INTERNAL
```
3. Khởi động lại Samba AD DC và kiểm tra:
```bash
sudo systemctl restart samba-ad-dc
sudo samba-tool drs showrepl
```
4. Chuyển FSMO sang Samba:
```bash
sudo samba-tool fsmo transfer --role=all -U Administrator
```

---

## 4. Đồng bộ SYSVOL

1. Trên Windows Server 2016 (Admin CMD):
```cmd
robocopy "\\dc-samba\sysvol" "C:\Windows\SYSVOL\domain" /MIR /SEC /COPYALL
```
2. Trên Samba DC:
```bash
sudo samba-tool ntacl sysvolreset
```

---

## 5. Hạ cấp Windows Server 2016

1. Đảm bảo FSMO đã chuyển sang Samba.
2. Trên Windows Server: Remove Roles and Features → Active Directory Domain Services → demote.
3. Sau khi hạ cấp, có thể tắt VM cũ hoặc giữ lại làm workstation.

---

## 6. Kiểm tra sau chuyển đổi

- Đổi Primary DNS trên client/DHCP về IP Samba DC (`192.168.1.10`).
- Trên client Windows:
```powershell
nltest /dsgetdc:tenmien.vn
```
- Khởi động lại client và đăng nhập lại.

---

## 7. Thiết lập File Share / Member Server (VM2)

1. Cài Samba trên VM2:
```bash
sudo apt install samba
```
2. Tạo thư mục và cấu hình share:
```bash
sudo mkdir -p /mnt/data
```
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
3. Join VM2 vào domain:
```bash
sudo net ads join -U Administrator
```
4. Nếu không giải được tên DC, thêm vào `/etc/hosts`:
```bash
sudo sh -c 'echo "192.168.1.10 dc1.tenmien.vn dc1" >> /etc/hosts'
```
5. Thêm `winbind` vào `passwd` và `group` trong `/etc/nsswitch.conf` rồi khởi động lại winbind.
6. Phân quyền:
```bash
sudo chown -R root:"Domain Users" /mnt/data
sudo chmod -R 770 /mnt/data
```

---

## 8. Giải quyết lỗi DNS trên Ubuntu

Nếu Samba DC gặp lỗi DNS do `systemd-resolved`:
```bash
sudo systemctl stop systemd-resolved
sudo systemctl disable systemd-resolved
sudo rm -f /etc/resolv.conf
sudo sh -c 'echo "nameserver 127.0.0.1" > /etc/resolv.conf'
sudo systemctl restart samba-ad-dc
```
Kiểm tra:
```bash
host -t SRV _ldap._tcp.tenmien.vn 127.0.0.1
```

*Nếu VM2 mất Internet khi cài gói, thêm tạm `nameserver 8.8.8.8` vào `/etc/resolv.conf`.*

---

## 9. Kiểm tra nhanh

```bash
samba-tool user list
samba-tool group list
samba-tool fsmo show
samba-tool drs showrepl
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
