#!/bin/bash
# ZaloCRM Bare-Metal / PM2 Setup Script for Debian/Ubuntu (WSL)

echo "🚀 Bắt đầu cài đặt ZaloCRM (Bare-Metal) bằng PM2..."

# 1. Cài đặt các gói hệ thống cần thiết
echo "📦 Cài đặt Node.js, PostgreSQL, Redis, Nginx..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs postgresql redis-server nginx openssl wget curl

# 2. Cài đặt MinIO (Object Storage) thay cho container
echo "🗄️ Cài đặt MinIO..."
if ! command -v minio &> /dev/null; then
    wget https://dl.min.io/server/minio/release/linux-amd64/minio
    chmod +x minio
    sudo mv minio /usr/local/bin/
fi
mkdir -p minio-data

# 3. Cài đặt PM2
echo "⚙️ Cài đặt PM2..."
sudo npm install -g pm2

# 4. Thiết lập Database PostgreSQL
echo "🐘 Cấu hình PostgreSQL..."
sudo -u postgres psql -c "CREATE USER crmuser WITH PASSWORD 'password';" || true
sudo -u postgres psql -c "CREATE DATABASE zalocrm OWNER crmuser;" || true
sudo -u postgres psql -c "ALTER USER crmuser CREATEDB;" || true

# 5. Cập nhật file .env cho môi trường Localhost
echo "📝 Cập nhật file .env..."
if [ ! -f .env ]; then
    cp backend/.env.example .env
fi

# Sửa các host từ docker sang localhost
sed -i 's/db:5432/localhost:5432/g' .env
sed -i 's/redis:6379/localhost:6379/g' .env
sed -i 's/minio:9000/localhost:9000/g' .env

# Tạo symlink .env cho backend và frontend để chắc chắn chúng dùng chung
ln -sf ../.env backend/.env
ln -sf ../.env frontend/.env

# 6. Khởi chạy MinIO bằng PM2
echo "▶️ Khởi chạy MinIO..."
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin pm2 start minio --name "zalocrm-minio" -- server ./minio-data --console-address ":9001"

# Đợi MinIO khởi động và tạo bucket
sleep 3
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
./mc alias set local http://localhost:9000 minioadmin minioadmin
./mc mb --ignore-existing local/zalocrm-attachments
./mc anonymous set download local/zalocrm-attachments
rm mc

# 7. Cài đặt & Build Backend
echo "🛠️ Build Backend..."
cd backend
npm install
npx prisma generate
npm run build
npx prisma db push --accept-data-loss

# Khởi chạy Backend bằng PM2
echo "▶️ Khởi chạy Backend API..."
NODE_ENV=production pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"
cd ..

# 8. Cài đặt & Build Frontend
echo "🛠️ Build Frontend..."
cd frontend
npm install
npm run build
cd ..

# Lưu cấu hình PM2
pm2 save

# 9. Cấu hình Nginx
echo "🌐 Đang cấu hình Nginx..."
cat > zalocrm.nginx <<EOF
server {
    listen 80;
    server_name _;

    location / {
        root $PWD/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

sudo mv zalocrm.nginx /etc/nginx/sites-available/zalocrm
sudo ln -sf /etc/nginx/sites-available/zalocrm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "🔑 Phân quyền thư mục cho Nginx..."
sudo chmod 755 $HOME
sudo chmod 755 $PWD
sudo chmod -R 755 $PWD/frontend/dist

sudo systemctl restart nginx

echo ""
echo "✅ HOÀN TẤT! ZaloCRM đã được tự động hóa toàn bộ và khởi chạy thành công!"
echo "Bạn có thể quản lý các tiến trình bằng lệnh: pm2 status"
echo "Truy cập giao diện Web tại: http://<IP_MÁY_CHỦ>"
echo ""
