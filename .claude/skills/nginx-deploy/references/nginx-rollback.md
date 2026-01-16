# Nginx 配置回滚

## 回滚步骤

```bash
sudo mv /etc/nginx/sites-available/onekey-rag.conf /etc/nginx/sites-available/onekey-rag.conf.bak
sudo cp /etc/nginx/sites-available/onekey-rag.conf.bak /etc/nginx/sites-available/onekey-rag.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 验证

```bash
curl -sS http://<DOMAIN>/api/v1/tx/analyze -I
```
