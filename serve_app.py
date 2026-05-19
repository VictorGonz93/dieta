#!/usr/bin/env python3
"""
Simple HTTP Server for serving the Nutrition Tracker App
Runs on localhost:5000
"""

import http.server
import socketserver
import os
from pathlib import Path

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def run_app_server(port=5000):
    # Change to app directory
    os.chdir(Path(__file__).parent / 'app')
    
    handler = MyHTTPRequestHandler
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"\n🌐 App server running on http://localhost:{port}")
        print(f"📲 Open http://localhost:{port}/index.html\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 Shutting down...")
            httpd.shutdown()

if __name__ == '__main__':
    run_app_server(5000)
