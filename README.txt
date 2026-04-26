Amy Travel Railway 版本

本地完整预览：
双击 启动本地服务器.bat，然后打开：
http://localhost:3000

上传入口：
http://localhost:3000/upload.html

说明：
这个版本用于 Railway 部署。照片和旅行介绍会保存到 /app/data 对应的 Volume。
如果配置 OPENAI_API_KEY，上传时会自动润色你写的简单介绍。

默认本地密码：
amy-travel

Railway 需要设置：
ADMIN_PASSWORD
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY 可选

详细步骤见：
RAILWAY部署说明.txt
