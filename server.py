import http.server
import socketserver
import mimetypes

# Добавляем/принудительно проставляем типы, которые Python не знает
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('image/jpeg', '.jpg')
mimetypes.add_type('image/jpeg', '.jpeg')
mimetypes.add_type('image/png', '.png')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('text/javascript', '.js')

PORT = 8000
DIRECTORY = '.'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print('Serving on port', PORT)
    httpd.serve_forever()