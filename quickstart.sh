#!/bin/bash
echo "🚀 Khởi động toàn bộ hệ thống ZaloCRM..."

# Dọn dẹp các tiến trình cũ (nếu có)
pm2 delete all 2>/dev/null

cd ~/ZaloCRM

# 1. Khởi động MinIO
echo "▶️ Đang chạy MinIO..."
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin pm2 start minio --name "zalocrm-minio" -- server ./minio-data --console-address ":9001"

# 2. Khởi động Backend
echo "▶️ Đang chạy Backend..."
cd backend
NODE_ENV=production pm2 start dist/app.js --name "zalocrm-api" --node-args="--env-file=.env"
cd ..

# 3. Đảm bảo Nginx đang chạy (Frontend)
echo "▶️ Đang kiểm tra Nginx (phục vụ Frontend)..."
sudo systemctl start nginx 2>/dev/null || true

# Lưu lại trạng thái để PM2 tự khởi động cùng OS
pm2 save

echo ""
echo "✅ HỆ THỐNG ĐÃ HOẠT ĐỘNG!"
echo "👉 Truy cập ZaloCRM Web: http://<IP_MÁY_CHỦ>"
echo "👉 MinIO Storage Console: http://<IP_MÁY_CHỦ>:9001"
echo "👉 Để xem logs hoạt động theo thời gian thực, gõ: pm2 logs"
