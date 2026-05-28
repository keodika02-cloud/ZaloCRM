#!/bin/bash
# ZaloCRM Proxy Configuration & Management Tool

# Thiết lập đường dẫn file .env
ENV_FILE="/home/servervm/ZaloCRM/.env"

clear
echo "=========================================================="
echo "   Hệ thống Quản lý Proxy ZaloCRM (Sử dụng Gost & PM2)   "
echo "=========================================================="
echo "1. Bật hoặc Cập nhật SOCKS5 Proxy"
echo "2. Tắt Proxy (Kết nối trực tiếp Internet)"
echo "3. Kiểm tra trạng thái Proxy hiện tại"
echo "4. Thoát"
echo "=========================================================="
read -p "Chọn chức năng (1-4): " choice

case $choice in
    1)
        echo ""
        echo ">> Thiết lập thông tin SOCKS5 Proxy mới:"
        read -p "- Nhập địa chỉ IP Proxy (Mặc định: 103.1.236.198): " proxy_ip
        proxy_ip=${proxy_ip:-103.1.236.198}
        
        read -p "- Nhập Cổng (Port) Proxy (Mặc định: 1080): " proxy_port
        proxy_port=${proxy_port:-1080}
        
        read -p "- Nhập tên đăng nhập (Username - để trống nếu không có): " proxy_user
        
        if [ -n "$proxy_user" ]; then
            read -sp "- Nhập mật khẩu (Password): " proxy_pass
            echo ""
        fi
        
        # Tạo chuỗi đích kết nối cho Gost
        if [ -n "$proxy_user" ] && [ -n "$proxy_pass" ]; then
            # Hỗ trợ proxy có tài khoản và mật khẩu
            gost_dest="socks5://$proxy_user:$proxy_pass@$proxy_ip:$proxy_port"
        else
            # Hỗ trợ proxy không có mật khẩu (hoặc xác thực IP)
            gost_dest="socks5://$proxy_ip:$proxy_port"
        fi
        
        echo ""
        echo "🔄 1. Đang đăng ký/khởi chạy Gost Proxy trên cổng 8080 qua PM2..."
        pm2 delete zalocrm-proxy 2>/dev/null || true
        pm2 start /usr/local/bin/gost --name "zalocrm-proxy" -- -L auto://:8080 -F "$gost_dest"
        pm2 save
        
        echo "🔄 2. Đang cập nhật tệp cấu hình .env..."
        if [ -f "$ENV_FILE" ]; then
            # Kiểm tra nếu chưa tồn tại dòng cấu hình proxy thì thêm mới vào cuối file
            if ! grep -q "HTTP_PROXY=" "$ENV_FILE"; then
                echo "" >> "$ENV_FILE"
                echo "# --- Proxy ---" >> "$ENV_FILE"
                echo "HTTP_PROXY=http://127.0.0.1:8080" >> "$ENV_FILE"
                echo "HTTPS_PROXY=http://127.0.0.1:8080" >> "$ENV_FILE"
                echo "NO_PROXY=localhost,127.0.0.1" >> "$ENV_FILE"
            else
                # Bỏ dấu comment (#) để kích hoạt proxy
                sed -i 's/^#\s*HTTP_PROXY=/HTTP_PROXY=/g' "$ENV_FILE"
                sed -i 's/^#\s*HTTPS_PROXY=/HTTPS_PROXY=/g' "$ENV_FILE"
                sed -i 's/^#\s*NO_PROXY=/NO_PROXY=/g' "$ENV_FILE"
            fi
        else
            echo "❌ Lỗi: Không tìm thấy file .env tại đường dẫn $ENV_FILE"
            exit 1
        fi
        
        echo "🔄 3. Đang khởi động lại Backend zalocrm-api..."
        pm2 restart zalocrm-api --update-env
        
        echo ""
        echo "✅ HOÀN TẤT: Hệ thống proxy đã được kích hoạt!"
        echo "- Dịch vụ gost đang chạy ngầm trên PM2: 'zalocrm-proxy'"
        echo "- Log hoạt động của proxy xem qua lệnh: pm2 logs zalocrm-proxy"
        echo "- Hãy thử reload trang ZaloCRM và đăng nhập lại bằng QR code."
        ;;
        
    2)
        echo ""
        echo "🔄 1. Đang dừng và xóa dịch vụ Gost khỏi PM2..."
        pm2 delete zalocrm-proxy 2>/dev/null || true
        pm2 save
        
        echo "🔄 2. Đang vô hiệu hóa biến môi trường proxy trong .env..."
        if [ -f "$ENV_FILE" ]; then
            # Thêm dấu comment (#) để vô hiệu hóa
            sed -i 's/^HTTP_PROXY=/# HTTP_PROXY=/g' "$ENV_FILE"
            sed -i 's/^HTTPS_PROXY=/# HTTPS_PROXY=/g' "$ENV_FILE"
            sed -i 's/^NO_PROXY=/# NO_PROXY=/g' "$ENV_FILE"
        fi
        
        echo "🔄 3. Đang khởi động lại Backend zalocrm-api..."
        pm2 restart zalocrm-api --update-env
        
        echo ""
        echo "✅ HOÀN TẤT: Đã tắt proxy toàn cục! Ứng dụng hiện kết nối trực tiếp Internet."
        ;;
        
    3)
        echo ""
        echo ">> Trạng thái PM2 của các tiến trình:"
        pm2 status
        
        echo ""
        echo ">> Cấu hình Proxy hiện tại trong .env:"
        if [ -f "$ENV_FILE" ]; then
            grep -E "HTTP_PROXY|HTTPS_PROXY" "$ENV_FILE"
        else
            echo "❌ Không tìm thấy file .env"
        fi
        
        echo ""
        echo ">> Kiểm tra kết nối trực tiếp đến Zalo:"
        curl -s -I https://wpa.chat.zalo.me/ | head -n 1
        ;;
        
    *)
        echo "Thoát."
        exit 0
        ;;
esac
