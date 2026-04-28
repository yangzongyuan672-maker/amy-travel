Amy Travel Railway 版本

本地完整预览：
双击 启动本地服务器.bat，然后打开：
http://localhost:3000

上传入口：
http://localhost:3000/upload.html

说明：
这个版本用于 Railway 部署。照片和旅行介绍会保存到 /app/data 对应的 Volume。
如果配置 OPENAI_API_KEY，上传时会自动润色你写的简单介绍。
上传照片会自动压缩成网页适合的大小，最长边约 2000px。

页面结构：
首页显示最新旅行和专辑目录。
每个旅行会生成独立专辑页，不会把所有照片堆在首页。

新增功能：
1. 可以给已有专辑继续追加照片或视频。
2. 可以上传 iPhone 实况照片导出的视频到顶部 Motion Wall。
3. 首页顶部 Motion Wall 只展示最近约 12 个视频，视频进入视口才自动播放，滑走会暂停。
4. videos.html 可以查看所有置顶视频。

默认本地密码：
amy-travel

Railway 需要设置：
ADMIN_PASSWORD
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY 可选

详细步骤见：
RAILWAY部署说明.txt
