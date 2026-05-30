# Hướng dẫn chi tiết Triển khai ZaloCRM từ đầu trên Proxmox LXC

Tài liệu này là cẩm nang hướng dẫn từng bước thiết lập hệ thống ZaloCRM trên các Container Proxmox LXC mới (ví dụ: `103`, `104`...), bắt đầu từ cấu hình phần cứng trên máy chủ vật lý Proxmox VE (PVE Host) cho đến cài đặt phần mềm bên trong container.

---

## BƯỚC 1: Cấu hình và Chuẩn bị trên Proxmox Host

Bạn có thể lựa chọn tạo Container thông qua **Giao diện Web UI** (Dễ làm) hoặc **Dòng lệnh CLI** (Nhanh).

---

### PHƯƠNG ÁN A: Thực hiện trên Giao diện Proxmox Web UI (Khuyên dùng)

#### 1. Tải bản Template Debian 12
1. Trên cây thư mục bên trái, chọn ổ lưu trữ template của bạn (thường là **`local`**).
2. Nhấp vào mục **`CT Templates`** (Mẫu CT).
3. Nhấp vào nút **`Templates`** ở trên cùng.
4. Tìm kiếm từ khóa `debian-12`, chọn `debian-12-standard...` và nhấp **`Download`**. Đợi cho đến khi quá trình tải hoàn tất.

#### 2. Khởi chạy Trình tạo Container
1. Nhấp nút **`Create CT`** (Tạo CT) ở góc trên bên phải giao diện Web UI.

#### 3. Điền thông tin các Tab:
* **Tab General (Thông tin chung)**:
  * **Node**: Chọn node Proxmox của bạn.
  * **CT ID**: Nhập mã số container (ví dụ: `103`, `104`...).
  * **Hostname**: Đặt tên (ví dụ: `zalocrm-server-103`).
  * **Password / Confirm Password**: Nhập mật khẩu cho tài khoản `root`.
  * **Unprivileged container**: Luôn giữ **Đánh dấu chọn** (Bật chế độ container không đặc quyền để bảo mật).
  * Nhấn *Next*.
* **Tab Template (Mẫu)**:
  * **Storage**: Chọn ổ lưu trữ template (ví dụ: `local`).
  * **Template**: Chọn bản template `debian-12-standard...` vừa tải ở trên.
  * Nhấn *Next*.
* **Tab Root Disk (Ổ đĩa)**:
  * **Storage**: Chọn ổ đĩa ZFS chuyên dụng của bạn (ví dụ: `zalo-crm-zfs`).
  * **Disk size (GiB)**: Nhập dung lượng (khuyên dùng tối thiểu `8` hoặc `10` GiB).
  * Nhấn *Next*.
* **Tab CPU**:
  * **Cores**: Nhập số nhân CPU mong muốn (ví dụ: `16` hoặc `8`).
  * Nhấn *Next*.
* **Tab Memory (Bộ nhớ)**:
  * **Memory (MiB)**: Nhập `8192` (tương ứng với 8GB RAM).
  * **Swap (MiB)**: Nhập `2048` (tương ứng với 2GB Swap).
  * Nhấn *Next*.
* **Tab Network (Mạng)**:
  * **Name**: Đặt là `eth0`.
  * **Bridge**: Chọn `vmbr0` (hoặc bridge kết nối LAN của bạn).
  * **Firewall**: Đánh dấu chọn (Bật tường lửa).
  * **IPv4**: Chọn **`Static`**.
  * **IPv4/CIDR**: Nhập IP tĩnh của container và subnet (ví dụ: `192.168.0.221/24`).
  * **Gateway (IPv4)**: Nhập IP Gateway của router mạng LAN (ví dụ: `192.168.0.1`).
  * Nhấn *Next*.
* **Tab DNS**: Để mặc định (sử dụng cấu hình của PVE host).
* **Tab Confirm (Xác nhận)**:
  * Kiểm tra kỹ lại các thông tin.
  * **QUAN TRỌNG**: **KHÔNG** tích chọn vào ô *"Start after created"* (Khởi động sau khi tạo).
  * Nhấp **`Finish`** và đợi container được tạo thành công.

#### 4. Kích hoạt Nesting & Keyctl (Bắt buộc)
1. Sau khi Container tạo xong, chọn mã số Container (ví dụ: `103`) ở cây danh mục bên trái.
2. Điều hướng vào mục **`Options`** (Tuỳ chọn) -> chọn dòng **`Features`** (Tính năng) -> Nhấp **`Edit`** (Sửa).
3. Đánh dấu chọn vào cả hai mục: **`Nesting`** và **`Keyctl`**.
4. Nhấn **`OK`** để lưu cấu hình.
5. Nhấp nút **`Start`** (Khởi động) ở góc trên bên phải để bật container.

---

### PHƯƠNG ÁN B: Thực hiện qua Dòng lệnh PVE CLI (Dành cho Chuyên gia)

Nếu muốn tạo nhanh qua giao diện dòng lệnh SSH của PVE host:

#### 1. Khai báo phân vùng ZFS (Nếu chưa làm)
```bash
pvesm add zfspool zalo-crm-zfs --pool zalo-crm-zfs --content rootdir,images
```

#### 2. Tải bản Template Debian 12
```bash
pveam update
pveam download local debian-12-standard_12.2-1_amd64.tar.zst
```

#### 3. Khởi tạo Container tự động
```bash
pct create 103 /var/lib/vz/template/cache/debian-12-standard_12.2-1_amd64.tar.zst \
  -cores 16 \
  -memory 8192 \
  -swap 2048 \
  -hostname zalocrm-server-103 \
  -ostype debian \
  -storage zalo-crm-zfs \
  -rootfs zalo-crm-zfs:8 \
  -net0 name=eth0,bridge=vmbr0,firewall=1,ip=192.168.0.221/24,gw=192.168.0.1 \
  -unprivileged 1 \
  -features nesting=1,keyctl=1
```

#### 4. Đặt mật khẩu root và khởi động
```bash
lxc-attach -n 103 -- passwd
pct start 103
```

---

## BƯỚC 2: Đồng bộ mã nguồn & Phân quyền Unprivileged

Thực hiện trên **PVE Host**:

### 2.1 Tạo thư mục ứng dụng trong container
```bash
lxc-attach -n 103 -- mkdir -p /root/ZaloCRM
```

### 2.2 Sao chép mã nguồn từ Host vào Container
```bash
cp -r /root/qvc-zalo-crm/* /proc/103/root/root/ZaloCRM/
```

### 2.3 Phân quyền lại thư mục cho tài khoản root của container
Bởi vì container chạy ở chế độ Unprivileged (không đặc quyền), các file trên Host khi copy vào sẽ bị lệch UID. Bạn cần map lại quyền sở hữu về `100000` (tương ứng với `root` trong container):
```bash
chown -R 100000:100000 /proc/103/root/root/ZaloCRM/
```

---

## BƯỚC 3: Cấu hình Môi trường bên trong Container

Truy cập trực tiếp vào shell của container `103`:
```bash
lxc-attach -n 103
```
*(Toàn bộ các lệnh tiếp theo chạy **bên trong** container)*

### 3.1 Cập nhật múi giờ và hệ thống
```bash
timedatectl set-timezone Asia/Ho_Chi_Minh
apt update && apt upgrade -y
```

### 3.2 Cài đặt các gói phụ trợ cần thiết
```bash
apt install -y curl wget git build-essential postgresql redis-server nginx-light

# Bật và khởi chạy Postgres & Redis
systemctl enable --now postgresql
systemctl enable --now redis-server
```

### 3.3 Cài đặt Node.js v20 & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Cài đặt PM2 toàn cục để chạy ngầm dịch vụ
npm install -g pm2
```

### 3.4 Tạo cơ sở dữ liệu PostgreSQL
Chúng ta sẽ tạo mật khẩu ngẫu nhiên cho DB user:
```bash
# Tạo mật khẩu ngẫu nhiên cho database (ví dụ: DB_PASS)
# Bạn hãy ghi nhớ mật khẩu này để điền vào file .env ở bước sau.
DB_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9')
echo "Database Password: $DB_PASS"

# Chạy SQL khởi tạo
sudo -u postgres psql -c "CREATE USER zalocrm WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE zalocrm_db OWNER zalocrm;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE zalocrm_db TO zalocrm;"
```

### 3.5 Cài đặt MinIO (Object Storage)
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
mv minio /usr/local/bin/

# Tạo thư mục chứa dữ liệu tệp đính kèm
mkdir -p /root/ZaloCRM/minio-data
```

### 3.6 Cài đặt Gost (Để hỗ trợ proxy nếu cần dùng)
```bash
wget -O /tmp/gost.gz https://github.com/ginuerzh/gost/releases/download/v2.11.5/gost-linux-amd64-2.11.5.gz
gunzip /tmp/gost.gz
mv /tmp/gost /usr/local/bin/gost
chmod +x /usr/local/bin/gost
```

---

## BƯỚC 4: Tạo cấu hình `.env` cho Instance mới

Di chuyển vào thư mục dự án bên trong container:
```bash
cd /root/ZaloCRM
```

Tạo tệp `.env` với các nội dung sau. 

> [!WARNING]
> Cần chỉnh sửa các dòng sau cho khớp với thông số của Container mới:
> - `APP_URL` và `S3_PUBLIC_URL`: Thay đổi địa chỉ IP thành IP tĩnh của container hiện tại (ví dụ: `192.168.0.221`).
> - `DATABASE_URL`: Điền mật khẩu DB của bạn (đã tạo ở bước 3.4).
> - Sinh các khóa ngẫu nhiên mới bằng lệnh bên dưới để đảm bảo bảo mật.

Tạo khóa ngẫu nhiên trên Terminal:
```bash
# Lấy JWT_SECRET mới
openssl rand -hex 32

# Lấy ENCRYPTION_KEY mới
openssl rand -hex 16
```

Cấu hình tệp `/root/ZaloCRM/.env`:
```env
# --- Server ---
PORT=3000
APP_URL=http://192.168.0.221:97

# --- Database ---
DATABASE_URL="postgresql://zalocrm:MẬT_KHẨU_TẠO_Ở_BƯỚC_3.4@127.0.0.1:5432/zalocrm_db?schema=public"

# --- Redis ---
REDIS_URL="redis://127.0.0.1:6379"

# --- MinIO (S3) ---
S3_ENDPOINT="127.0.0.1"
S3_PORT=9000
S3_USE_SSL=false
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="zalocrm"
S3_PUBLIC_URL="http://192.168.0.221:97/zalocrm-attachments"

# --- Security ---
JWT_SECRET="KHOÁ_HEX_32_BYTES_TẠO_Ở_TRÊN"
ENCRYPTION_KEY="KHOÁ_HEX_16_BYTES_TẠO_Ở_TRÊN"

# --- Proxy --- (Vô hiệu hóa proxy mặc định để tránh xung đột)
# HTTP_PROXY=http://127.0.0.1:8080
# HTTPS_PROXY=http://127.0.0.1:8080
# NO_PROXY=localhost,127.0.0.1
```

---

## BƯỚC 5: Build và Cài đặt mã nguồn

Chạy các lệnh sau bên trong thư mục `/root/ZaloCRM`:

### 5.1 Cài đặt thư viện dependencies
```bash
npm install
cd backend && npm install && cd ../frontend && npm install && cd ..
```

### 5.2 Khởi tạo cấu trúc Database (Prisma Migrations)
```bash
cd backend
npx prisma db push --accept-data-loss
cd ..
```

### 5.3 Biên dịch và Build mã nguồn Frontend + Backend
```bash
# Build Frontend tĩnh
cd frontend && npm run build && cd ..

# Build Backend TypeScript sang JavaScript
cd backend && npm run build && cd ..
```

---

## BƯỚC 6: Khởi chạy và Quản lý Dịch vụ qua PM2

Chạy các dịch vụ ngầm bằng PM2:

### 6.1 Khởi chạy Storage MinIO
```bash
pm2 start "minio server /root/ZaloCRM/minio-data --console-address :9001" --name "zalocrm-minio"
```

### 6.2 Khởi chạy Backend API
```bash
cd /root/ZaloCRM/backend
pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"
```

### 6.3 Cấu hình tự động lưu và chạy khi khởi động hệ điều hành
```bash
pm2 save
pm2 startup
```
*Lưu ý: Nếu PM2 yêu cầu chạy thêm một lệnh command để kích hoạt systemd startup, hãy copy lệnh đó và chạy trên terminal.*

---

## BƯỚC 7: Cấu hình Nginx Web Proxy

Thiết lập Nginx làm Reverse Proxy để phục vụ Frontend tĩnh và điều phối các kết nối API/WebSocket/Tệp đính kèm.

### 7.1 Tạo tệp cấu hình ảo
Tạo file cấu hình `/etc/nginx/sites-available/zalocrm`:
```nginx
server {
    listen 97; # Cổng truy cập bên ngoài
    server_name _;

    # Phục vụ Frontend tĩnh
    location / {
        root /root/ZaloCRM/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy các tệp tin đính kèm sang MinIO
    location /zalocrm-attachments/ {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy các API Endpoint sang Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Nâng thời gian chờ cho các tác vụ đồng bộ lâu
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Proxy WebSocket (Kết nối thời gian thực)
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

### 7.2 Kích hoạt cấu hình
```bash
# Xóa cấu hình mặc định (nếu có)
rm -f /etc/nginx/sites-enabled/default

# Tạo liên kết tượng trưng kích hoạt site zalocrm
ln -sf /etc/nginx/sites-available/zalocrm /etc/nginx/sites-enabled/

# Kiểm tra cú pháp và khởi động lại Nginx
nginx -t
systemctl restart nginx
```

Bây giờ bạn đã có một Instance ZaloCRM chạy hoàn toàn độc lập tại địa chỉ:
👉 **`http://192.168.0.221:97`**

---

## BƯỚC 8: Cấu hình Proxy riêng cho từng tài khoản Zalo (Tránh ban IP)

Khi bạn chạy nhiều Instance ZaloCRM (hoặc nhiều tài khoản Zalo trên cùng một container), Zalo có thể khóa tài khoản nếu phát hiện quá nhiều kết nối từ cùng một IP mạng LAN của bạn.

Để khắc phục:
1. Mua/chuẩn bị các địa chỉ **SOCKS5 Proxy** riêng biệt cho từng tài khoản Zalo.
2. Truy cập vào giao diện web của Instance tương ứng.
3. Đi tới **Cài đặt** (Settings) -> **Tài khoản Zalo** (Zalo Accounts).
4. Nhập chuỗi proxy của bạn vào ô cấu hình:
   `socks5://user:password@ip_proxy:port`
   *(Ví dụ: `socks5://socksuser:f67dc85b0cb8@103.1.236.198:1080`)*
5. Hệ thống sẽ tự động định tuyến các kết nối đến máy chủ Zalo của nick đó qua Proxy đã cấu hình.
