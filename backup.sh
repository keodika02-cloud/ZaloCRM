#!/bin/bash
echo "💾 Đang sao lưu cơ sở dữ liệu ZaloCRM..."
mkdir -p backups
BACKUP_FILE="backups/zalocrm_backup_$(date +%Y%m%d_%H%M%S).sql"

sudo -u postgres pg_dump zalocrm > $BACKUP_FILE

echo "✅ Sao lưu thành công tại: $BACKUP_FILE"
