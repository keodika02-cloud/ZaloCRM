# Hướng dẫn Triển khai & Vận hành nhiều Instance ZaloCRM trên Proxmox LXC

Tài liệu này hướng dẫn chi tiết các bước đã thực hiện để triển khai ZaloCRM trên container Proxmox LXC, đồng thời hướng dẫn cách tạo thêm các instance (phiên bản) ZaloCRM mới chạy trên các IP tĩnh khác nhau để vận hành độc lập.

---

## 1. Các bước đã triển khai (Instance hiện tại)

* **Container ID**: `102` (Tên: `server`)
* **Hệ điều hành**: Debian 12
* **Địa chỉ IP tĩnh**: `192.168.0.220`
* **Cổng truy cập**: `97` (`http://192.168.0.220:97`)
* **Dịch vụ chạy ngầm (PM2)**:
  * `zalocrm-api` (Cổng 3000)
  * `zalocrm-minio` (Cổng 9000/9001)

### Các tinh chỉnh quan trọng đã thực hiện:
1. **LXC Nesting & Keyctl**: Kích hoạt hai tính năng này trong cấu hình LXC để cho phép các dịch vụ hệ thống như PostgreSQL, Redis và PM2 khởi chạy ổn định.
2. **Định tuyến IP tĩnh**: Thay vì cấu hình tên miền cục bộ phức tạp, ứng dụng đã được định tuyến truy cập trực tiếp bằng IP tĩnh và cổng `97`.
3. **Sửa lỗi WebSocket 502 (Bad Gateway)**: Nginx được cấu hình chuyển tiếp qua IP IPv4 cụ thể `127.0.0.1` thay vì `localhost` để tránh xung đột phân giải IPv6 (`[::1]`).
4. **Hỗ trợ SOCKS5 Proxy**: Cấu hình phần mềm cho phép nhập chuỗi proxy định dạng `socks5://` trực tiếp trên giao diện quản trị Web giúp tránh trùng lặp IP gây khóa nick Zalo.

---

## 2. Hướng dẫn tạo thêm Instance ZaloCRM mới (IP tĩnh khác)

Khi cần chạy thêm một phiên bản ZaloCRM độc lập (cho chi nhánh khác, hoặc nhóm nhân viên khác) với IP tĩnh riêng biệt, thực hiện theo các bước sau:

### Bước 2.1: Tạo Container LXC mới trên Proxmox
1. Đăng nhập vào giao diện Web Proxmox VE.
2. Nhấp chuột phải vào Node -> **Create CT**:
   * **CT ID**: Nhập số ID tiếp theo (ví dụ: `103`).
   * **Hostname**: Nhập tên (ví dụ: `zalocrm-server2`).
   * **Template**: Chọn `debian-12-standard` (hoặc `ubuntu-24.04-standard`).
   * **Root Disk**: Chọn phân vùng lưu trữ (ví dụ: `zalo-crm-zfs`) và dung lượng mong muốn (tối thiểu 10GB-20GB).
   * **CPU/RAM**: Thiết lập theo nhu cầu (ví dụ: 8 Cores CPU, 4GB-8GB RAM, 2GB Swap).
   * **Network**:
     * **Bridge**: Chọn `vmbr0` (hoặc bridge kết nối với mạng LAN của bạn).
     * **IPv4**: Chọn **Static** và điền IP tĩnh mới chưa sử dụng (ví dụ: `192.168.0.221/24`).
     * **Gateway**: Điền IP gateway mạng LAN của bạn (ví dụ: `192.168.0.1`).
3. Sau khi tạo xong, **KHÔNG khởi động container ngay**. Đi tới tab **Options** của container mới:
   * Chọn **Features** -> Nhấp **Edit**.
   * Đánh dấu chọn cả **Nesting** và **Keyctl**.
   * Nhấn **OK** để lưu.
4. Khởi động Container mới lên.

---

### Bước 2.2: Đồng bộ mã nguồn ứng dụng
Từ máy chủ Proxmox Host, sao chép thư mục mã nguồn sang container mới (thay `103` bằng ID container mới của bạn):
```bash
# Tạo thư mục nhận trên container mới
lxc-attach -n 103 -- mkdir -p /root/ZaloCRM

# Sao chép dữ liệu từ thư mục dự án trên host
cp -r /root/qvc-zalo-crm/* /proc/103/root/root/ZaloCRM/

# Phân quyền sở hữu chính xác cho root bên trong container
chown -R 100000:100000 /proc/103/root/root/ZaloCRM/
```

---

### Bước 2.3: Cài đặt các dịch vụ phụ trợ (Dependencies)
Truy cập vào container mới qua SSH hoặc bảng điều khiển Proxmox (hoặc chạy lệnh `lxc-attach -n 103`) và cài đặt các gói cần thiết:
```bash
# Cập nhật hệ thống
apt update && apt upgrade -y

# Cài đặt PostgreSQL, Redis, Nginx và các công cụ bổ trợ
apt install -y curl wget git build-essential postgresql redis-server nginx-light

# Khởi động và kích hoạt tự chạy khi boot cho Postgres & Redis
systemctl enable --now postgresql
systemctl enable --now redis-server

# Cài đặt Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Cài đặt PM2 toàn cục
npm install -y -g pm2
```

---

### Bước 2.4: Cấu hình Cơ sở dữ liệu PostgreSQL
Tạo người dùng và database mới cho ZaloCRM bên trong container:
```bash
# Đăng nhập vào postgres và chạy các lệnh SQL
sudo -u postgres psql -c "CREATE USER zalocrm WITH PASSWORD 'Mật_Khẩu_Cực_Kỳ_Bảo_Mật';"
sudo -u postgres psql -c "CREATE DATABASE zalocrm_db OWNER zalocrm;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE zalocrm_db TO zalocrm;"
```

---

### Bước 2.5: Cài đặt và cấu hình MinIO (Object Storage)
Tải và cài đặt MinIO server:
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
mv minio /usr/local/bin/

# Tạo thư mục lưu trữ data của MinIO
mkdir -p /root/ZaloCRM/minio-data
```

---

### Bước 2.6: Thiết lập tệp môi trường `.env`
Di chuyển vào thư mục `/root/ZaloCRM` trên container mới, tạo file `.env` và cấu hình các giá trị phù hợp với **IP tĩnh mới** (Ví dụ: `192.168.0.221` và cổng truy cập `97`):

```env
PORT=3000
APP_URL=http://192.168.0.221:97

# Kết nối database (khớp với mật khẩu đã tạo ở Bước 2.4)
DATABASE_URL="postgresql://zalocrm:Mật_Khẩu_Cực_Kỳ_Bảo_Mật@127.0.0.1:5432/zalocrm_db?schema=public"

# Redis cache
REDIS_URL="redis://127.0.0.1:6379"

# S3 MinIO cấu hình (Đổi IP thành IP tĩnh mới)
S3_ENDPOINT="127.0.0.1"
S3_PORT=9000
S3_USE_SSL=false
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="zalocrm"
S3_PUBLIC_URL="http://192.168.0.221:97/zalocrm-attachments"

# Tạo khóa bảo mật ngẫu nhiên (chạy lệnh openssl rand -hex 32 và 16)
JWT_SECRET="Chuỗi_Hex_Ngẫu_Nhiên_32_Bytes"
ENCRYPTION_KEY="Chuỗi_Hex_Ngẫu_Nhiên_16_Bytes"
```

---

### Bước 2.7: Build dự án & khởi chạy PM2
```bash
cd /root/ZaloCRM

# Cài đặt node modules
npm install
cd backend && npm install && cd ../frontend && npm install && cd ..

# Tạo cơ sở dữ liệu Prisma
cd backend
npx prisma db push --accept-data-loss
cd ..

# Build Frontend & Backend
cd frontend && npm run build && cd ..
cd backend && npm run build && cd ..

# Khởi chạy dịch vụ qua PM2
pm2 start "minio server /root/ZaloCRM/minio-data --console-address :9001" --name "zalocrm-minio"
cd backend
pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"

# Lưu trạng thái PM2 tự khởi động cùng OS
pm2 save
pm2 startup
```

---

### Bước 2.8: Cấu hình Nginx Proxy
Tạo tệp cấu hình mới tại `/etc/nginx/sites-available/zalocrm`:

```nginx
server {
    listen 97; # Cổng truy cập của ứng dụng
    server_name _;

    location / {
        root /root/ZaloCRM/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /zalocrm-attachments/ {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
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

Kích hoạt cấu hình site mới trong Nginx:
```bash
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/zalocrm /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

Bây giờ bạn có thể truy cập Instance ZaloCRM thứ hai qua địa chỉ: **`http://192.168.0.221:97`**!

---

## 3. Cấu hình Proxy để tránh trùng IP Zalo
Vì Zalo giới hạn số lượng tài khoản kết nối đồng thời từ cùng một địa chỉ IP, khi chạy nhiều instance ZaloCRM hoặc nhiều tài khoản trên cùng một mạng LAN, hãy trang bị các SOCKS5 Proxy riêng biệt cho mỗi tài khoản:
1. Mở trình duyệt truy cập ứng dụng ZaloCRM tương ứng.
2. Vào phần **Cài đặt** (Settings) -> **Tài khoản Zalo** (Zalo Accounts).
3. Nhập chuỗi kết nối SOCKS5 riêng biệt vào trường **Cấu hình Proxy**:
   `socks5://tên_đăng_nhập:mật_khẩu@địa_chỉ_ip_proxy:cổng`
4. Hệ thống sẽ tự động định tuyến toàn bộ chat và đồng bộ của tài khoản đó qua IP Proxy tương ứng.
