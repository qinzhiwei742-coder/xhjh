#!/usr/bin/env python3
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

class DownloadHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

os.chdir('/workspace')
server = HTTPServer(('0.0.0.0', 8080), DownloadHandler)
print("下载服务器已启动！")
print("下载地址：http://localhost:8080/Infinite-Canvas-优化版.zip")
print("按 Ctrl+C 停止服务器")
server.serve_forever()