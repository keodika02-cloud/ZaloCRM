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

## 10. Ghi chú rút gọn

- Giữ Samba DC và File Share tách biệt.
- Nếu dùng VM2 làm nền tảng ứng dụng, chạy PM2 với `--env-file=.env`.
- Dùng GPO để ánh xạ ổ mạng nếu cần, trỏ tới `\\<IP_VM2>\Data`.

---

*Hướng dẫn này đã được tinh gọn để tập trung vào các bước chuyển đổi chính và loại bỏ thông tin trùng lặp.*
