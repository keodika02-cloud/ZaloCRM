# Báo cáo Cấu hình Hệ thống Proxy & Hướng dẫn Vận hành ZaloCRM

Tài liệu này trình bày chi tiết về kiến trúc proxy, cách xử lý sự cố lỗi kết nối Zalo, và hướng dẫn cài đặt/khôi phục hệ thống khi triển khai lại máy chủ ảo (VM).

---

## 1. Kiến trúc Proxy trong ZaloCRM

Để đảm bảo các tài khoản Zalo hoạt động an toàn và không bị khóa/hạn chế bởi Zalo, hệ thống hỗ trợ định tuyến lưu lượng qua proxy.

### A. Cơ chế SOCKS5 Proxy cho từng tài khoản (Per-Account Proxy)
- Hệ thống hỗ trợ cấu hình proxy riêng biệt cho từng tài khoản Zalo qua giao diện quản trị (**Cài đặt -> Tài khoản Zalo -> Cấu hình Proxy**).
- Thông tin proxy được lưu vào cột `proxy_url` trong bảng `zalo_accounts` ở database (dưới dạng mã hóa an toàn).
- Khi backend (`zca-js` / `openzca`) kết nối với Zalo, nó sẽ khởi tạo một SOCKS5 Agent tương ứng để định tuyến riêng cho tài khoản đó. Điều này giúp mỗi nick Zalo có một địa chỉ IP độc lập.

### B. API Proxy Tải Tệp Đính Kèm (Attachment Download Proxy)
- Tệp tin, hình ảnh và video lưu trữ trên CDN của Zalo (ví dụ: các tên miền `dlfl.vn`) yêu cầu cookie phiên đăng nhập và định tuyến phù hợp để tải về.
- Backend cung cấp một endpoint trung gian: `GET /api/v1/conversations/:id/attachments/download`
- Khi sale click tải tệp trong khung chat, trình duyệt sẽ gọi endpoint này. Backend sẽ dùng proxy của tài khoản tương ứng để tải tệp từ Zalo CDN, sau đó stream trực tiếp dữ liệu về trình duyệt của sale.

---

## 2. Sự cố Proxy Toàn cục & Cách Khắc Phục

### A. Nguyên nhân lỗi `TypeError: fetch failed`
Khi máy ảo khởi động lại, dịch vụ proxy trung gian `gost` (trước đó chạy trên cổng `8080` của máy ảo để chuyển tiếp qua proxy SOCKS5 ngoài) không tự động chạy lại.
Trong khi đó, file cấu hình `.env` của backend vẫn chứa các biến môi trường cấu hình proxy toàn cục:
```env
HTTP_PROXY=http://127.0.0.1:8080
HTTPS_PROXY=http://127.0.0.1:8080
```
Điều này khiến toàn bộ các yêu cầu HTTP/HTTPS của ứng dụng Node.js (bao gồm việc lấy mã QR để đăng nhập Zalo) bị ép đi qua cổng `8080` đang bị treo/chết, dẫn đến lỗi kết nối `TypeError: fetch failed`.

### B. Giải pháp khắc phục triệt để
1. **Kết nối trực tiếp**: Do máy chủ ảo hoàn toàn có thể kết nối trực tiếp đến các máy chủ của Zalo không qua chặn lọc, việc dùng proxy toàn cục là không cần thiết. Chúng tôi đã tắt cấu hình proxy toàn cục bằng cách comment các dòng này trong file `.env` trên VM.
2. **Dùng Proxy riêng lẻ**: Nếu sau này cần dùng proxy để đổi IP cho các nick Zalo cá nhân, sale/admin hãy cấu hình trực tiếp trên giao diện Web (phần **Tài khoản Zalo -> Cấu hình Proxy**). Việc này đảm bảo tính năng đồng bộ và hoạt động chung của hệ thống không bị ảnh hưởng khi proxy gặp sự cố.

---

## 3. Hướng dẫn Cài đặt & Triển khai lại từ đầu (Khi cài lại máy ảo)

Nếu bạn cài đặt lại máy ảo VM (`192.168.0.97`) trong tương lai, hãy thực hiện các bước sau để đảm bảo hệ thống vận hành đúng:

### Bước 1: Khởi tạo ứng dụng bằng PM2
Hệ thống sử dụng PM2 để chạy ngầm và tự động khởi động cùng hệ điều hành:
```bash
cd /home/servervm/ZaloCRM/backend
# Build dự án TypeScript
npm run build
# Khởi chạy API với file môi trường .env
pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"

# Khởi chạy MinIO (Object Storage)
pm2 start "minio server /home/servervm/ZaloCRM/minio-data --console-address :9001" --name "zalocrm-minio"

# Lưu trạng thái PM2 và kích hoạt tự khởi động khi boot
pm2 save
pm2 startup
```

### Bước 2: Cấu hình File Môi trường `.env`
Sao chép mẫu và chỉnh sửa cấu hình `.env` tại thư mục gốc `/home/servervm/ZaloCRM/.env`:
- **Đường dẫn MinIO công khai**: Để sale xem được tệp đính kèm từ trình duyệt:
  ```env
  S3_PUBLIC_URL=http://192.168.0.97:9000
  ```
- **Tắt proxy toàn cục**: Đảm bảo các dòng proxy ở cuối file `.env` được tắt (có dấu `#` phía trước):
  ```env
  # HTTP_PROXY=http://127.0.0.1:8080
  # HTTPS_PROXY=http://127.0.0.1:8080
  ```

### Bước 3: Cấu hình Nginx (Hạn chế tối đa đứt kết nối đồng bộ)
Do quá trình đồng bộ tin nhắn/danh bạ có thể mất từ 1 đến 3 phút, Nginx phải được nâng cấu hình thời gian chờ (`timeout`) lên 5 phút (300 giây).

Chỉnh sửa cấu hình site Nginx `/etc/nginx/sites-available/zalocrm`:
```nginx
server {
    listen 80;
    server_name _;

    # Phục vụ giao diện tĩnh Frontend
    location / {
        root /home/servervm/ZaloCRM/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Định tuyến cổng API Backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Nâng giới hạn thời gian chờ đồng bộ
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Định tuyến cổng WebSocket (Socket.io) cập nhật thời gian thực
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Kiểm tra và tải lại cấu hình Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```
