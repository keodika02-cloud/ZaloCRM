#!/bin/bash
echo "🔄 Đang cập nhật ZaloCRM lên phiên bản mới nhất..."

# Lấy code mới nhất
git pull origin main

# Cập nhật backend
echo "📦 Cập nhật Backend..."
cd backend
npm install
npx prisma generate
npm run build
npx prisma db push --accept-data-loss
cd ..

# Cập nhật frontend
echo "📦 Cập nhật Frontend..."
cd frontend
npm install
npm run build
cd ..

# Khởi động lại hệ thống
echo "▶️ Khởi động lại hệ thống..."
pm2 restart all

echo "✅ Cập nhật thành công!"
