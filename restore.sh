#!/bin/bash
if [ -z "$1" ]; then
    echo "❌ Lỗi: Vui lòng truyền đường dẫn file backup!"
    echo "Cách dùng: ./restore.sh backups/ten_file.sql"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "❌ Lỗi: Không tìm thấy file $1"
    exit 1
fi

echo "⚠️ CẢNH BÁO: Dữ liệu hiện tại sẽ bị ghi đè bởi bản sao lưu!"
read -p "Bạn có chắc chắn muốn khôi phục không? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🛑 Đang tắt API để khôi phục..."
    pm2 stop zalocrm-api 2>/dev/null
    
    echo "♻️ Đang khôi phục cơ sở dữ liệu..."
    sudo -u postgres psql zalocrm < "$1"
    
    echo "▶️ Khởi động lại API..."
    pm2 start zalocrm-api
    
    echo "✅ Khôi phục thành công từ file: $1"
else
    echo "❌ Đã hủy thao tác."
fi
