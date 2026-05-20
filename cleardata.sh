#!/bin/bash
echo "⚠️ CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ dữ liệu khách hàng, tin nhắn, và file đính kèm!"
read -p "Bạn có chắc chắn muốn xóa không? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🛑 Đang tắt hệ thống..."
    pm2 delete all 2>/dev/null
    pm2 save --force
    
    echo "🗑️ Đang xóa cơ sở dữ liệu PostgreSQL..."
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS zalocrm;"
    sudo -u postgres psql -c "DROP USER IF EXISTS crmuser;"
    
    echo "🗑️ Đang xóa cache Redis..."
    redis-cli flushall
    
    echo "🗑️ Đang xóa file đính kèm MinIO..."
    rm -rf ~/ZaloCRM/minio-data
    rm -rf ~/.mc
    
    echo "✅ Toàn bộ dữ liệu đã bị xóa sạch! Chạy ./setup-pm2.sh để cài đặt lại."
else
    echo "❌ Đã hủy thao tác."
fi
