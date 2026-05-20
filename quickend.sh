#!/bin/bash
echo "🛑 Đang tắt hệ thống ZaloCRM..."

# Tắt các tiến trình nhưng GIỮ LẠI trong danh sách để có thể tự khởi động (nếu dùng pm2 startup)
pm2 stop all 2>/dev/null
pm2 save --force

echo "✅ Đã tắt toàn bộ hệ thống."
