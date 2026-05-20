# BÁO CÁO NGHIỆM THU TRIỂN KHAI HỆ THỐNG ZALOCRM

**Dự án:** Triển khai Hệ thống quản lý quan hệ khách hàng ZaloCRM (Production)
**Môi trường:** Hệ thống Mạng nội bộ (Samba Active Directory) / Virtual Machines
**Thời gian hoàn thành:** 19/05/2026

---

## 1. MỤC TIÊU DỰ ÁN
Mục tiêu của dự án là đưa mã nguồn ZaloCRM từ môi trường phát triển (Local/WSL) lên môi trường máy chủ thực tế (Production), tích hợp hệ thống xác thực mạng nội bộ Windows Domain để phục vụ quản lý tập trung và vận hành ổn định.

## 2. KIẾN TRÚC HỆ THỐNG ĐÃ TRIỂN KHAI

Hệ thống được quy hoạch bài bản với sự phân lập rõ ràng giữa Máy chủ Quản trị mạng và Máy chủ Ứng dụng, đảm bảo tính bảo mật và tối ưu hiệu suất:

1. **Máy chủ Số 1 (Domain Controller - VM1):**
   - Hệ điều hành: Ubuntu 24.04 LTS
   - Vai trò: Quản lý mạng nội bộ (Domain `cuongnh.testdomain`) bằng Samba AD DC.
   - Trạng thái: Đã xử lý triệt để xung đột cổng DNS (systemd-resolved), máy chủ có khả năng phân giải và cấp phát quyền (join domain) mượt mà cho các máy trạm.

2. **Máy chủ Số 2 (Application Server - VM2):**
   - Hệ điều hành: Ubuntu 24.04 LTS (Member Server)
   - Chức năng: Chứa toàn bộ Backend (Node.js/Prisma), Database (PostgreSQL), Cache (Redis), Object Storage (MinIO) và Frontend.
   - Core Manager: **PM2** điều phối và theo dõi hiệu suất hệ thống.
   - Reverse Proxy: **Nginx** xử lý điều hướng mạng, phục vụ nội dung tĩnh tốc độ cao và mở luồng WebSocket.

3. **Máy Trạm Số 3 (Client Workspace - VM3):**
   - Hệ điều hành: Windows 10/11 Pro
   - Vai trò: Máy tính nhân viên. Đã kết nối thành công vào Domain `cuongnh.testdomain` và sử dụng tài khoản mạng nội bộ để truy cập hệ thống ZaloCRM.

## 3. CÁC HẠNG MỤC CÔNG VIỆC ĐÃ HOÀN THÀNH

✅ **Tích hợp Domain & Xử lý mạng (Network/DNS):**
- Vô hiệu hóa `systemd-resolved` trên máy chủ, ép Samba làm dịch vụ DNS gốc.
- Đảm bảo các máy trong mạng LAN nhận diện và giao tiếp được với nhau qua chuẩn Active Directory.

✅ **Cấu hình Web Server (Nginx) & Tối ưu hóa API:**
- Khắc phục các rào cản phân quyền bảo mật của Linux để Nginx có thể truy xuất giao diện Web.
- Cấu hình Nginx `proxy_pass` để bảo vệ cổng API (3000).
- Thiết lập thành công cổng **Websocket (Socket.io)** cho Nginx, xử lý triệt để lỗi 429 Too Many Requests và giúp ZaloCRM tạo mã QR Code thời gian thực.

✅ **Bảo mật Cơ sở dữ liệu & Tối ưu PM2:**
- Khắc phục lỗi PM2 mất cấu hình biến môi trường (`DATABASE_URL`) bằng cách nhúng cờ `--env-file` vào lệnh khởi chạy.
- Database PostgreSQL được khởi tạo an toàn, cấu hình MinIO lưu trữ tệp đính kèm được đóng gói trọn vẹn.

✅ **Tích hợp File Share dùng chung & Tự động ánh xạ qua Group Policy (GPO):**
- **Member Server (VM2):** Cấu hình Samba tích hợp với Winbind để liên kết trực tiếp danh sách tài khoản Linux với Active Directory.
- **Phân quyền tập trung:** Tạo phân vùng dữ liệu `/mnt/data` và phân quyền sở hữu duy nhất cho nhóm `Domain Users` của mạng nội bộ, cho phép bất cứ tài khoản Domain nào đăng nhập cũng tự động có quyền đọc/ghi mà không cần can thiệp thủ công từng tài khoản.
- **Group Policy (GPO):** Thiết lập chính sách GPO mang tên `Auto-Map-Shared-Drive` trên Domain Controller (VM1), tự động "bơm" đường dẫn mạng `\\192.168.0.97\DuLieuChung` thành ổ đĩa mạng **Z: (Dữ Liệu Công Ty)** xuất hiện trực quan trong This PC của tất cả các máy trạm Windows đã join domain.

✅ **Tự động hóa Quy trình (Automation Scripts):**
Hệ thống hiện tại có thể được kiểm soát hoàn toàn bằng mã lệnh đã được tối ưu hóa:
- `setup-pm2.sh`: Tự động cài đặt 100% môi trường, phân quyền thư mục và cấu hình file Nginx.
- `quickstart.sh` / `quickend.sh`: Các tập lệnh bảo trì thông minh, giúp tắt/mở hệ thống an toàn ("hạ cánh mềm") mà không gây hỏng hóc CSDL.
- Tính năng **Auto-Start**: Cấu hình `pm2 startup` đã được kích hoạt, biến ứng dụng thành System Daemon để tự động sống lại ngay khi máy chủ có điện.

## 4. QUY TRÌNH VẬN HÀNH DÀNH CHO QUẢN TRỊ VIÊN (ADMIN)

**Khởi động / Tắt hệ thống (Maintenance Mode):**
- Tắt hệ thống an toàn (Trước khi tắt máy ảo): `cd ~/ZaloCRM && ./quickend.sh`
- Khởi động thủ công: `cd ~/ZaloCRM && ./quickstart.sh`
- Khởi động lại khi lỗi: `pm2 restart all`

**Xem Nhật ký hoạt động (Log Monitor):**
- Lệnh kiểm tra: `pm2 logs` (Dùng để bắt lỗi khi hệ thống không gửi được tin nhắn Zalo).

## 5. ĐÁNH GIÁ CHUNG & KẾT LUẬN

Hệ thống ZaloCRM hiện tại đã đạt **tiêu chuẩn môi trường Production**. Nó không chỉ chạy độc lập ổn định mà còn hoạt động mượt mà bên trong hệ sinh thái mạng nội bộ Windows khép kín (Samba AD). Mã nguồn và các tập lệnh đã được "Cứng hóa" (Hardened) đầy đủ để đối mặt với những sự cố thường gặp như mất điện, lỗi DNS hay sập Service.

Đề nghị: **Nghiệm thu thành công dự án.**
