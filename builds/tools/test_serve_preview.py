#!/usr/bin/env python3
"""Exercise media byte-range responses through the actual HTTP transport."""
import functools
import http.client
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from serve_preview import PreviewHandler


class QuietHandler(PreviewHandler):
    def log_message(self, *args):
        pass


class StreamTransportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.payload = bytes(range(256)) * 3
        Path(cls.directory.name, 'original.mp3').write_bytes(cls.payload)
        handler = functools.partial(QuietHandler, directory=cls.directory.name)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def request(self, method='GET', headers=None, path='/original.mp3'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_original_bytes_and_seek_ranges(self):
        status, headers, body = self.request()
        self.assertEqual((status, body), (200, self.payload))
        self.assertEqual(headers['Accept-Ranges'], 'bytes')
        for requested, start, end in [('bytes=17-40', 17, 40), ('bytes=700-', 700, 767), ('bytes=-19', 749, 767), ('bytes=750-9999', 750, 767)]:
            with self.subTest(requested=requested):
                status, headers, body = self.request(headers={'Range': requested, 'If-Modified-Since': 'Thu, 31 Dec 2099 23:59:59 GMT'})
                self.assertEqual(status, 206)
                self.assertEqual(body, self.payload[start:end + 1])
                self.assertEqual(headers['Content-Range'], f'bytes {start}-{end}/768')
                self.assertEqual(int(headers['Content-Length']), len(body))

    def test_head_and_rejected_ranges_do_not_transmit_extra_bytes(self):
        status, headers, body = self.request('HEAD', {'Range': 'bytes=100-109'})
        self.assertEqual((status, headers['Content-Length'], body), (206, '10', b''))
        for requested in ['bytes=768-', 'bytes=9-3', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=-', 'bytes=not-a-number']:
            with self.subTest(requested=requested):
                status, headers, body = self.request(headers={'Range': requested})
                self.assertEqual((status, headers['Content-Range'], body), (416, 'bytes */768', b''))
        self.assertEqual(self.request(path='/missing.mp3')[0], 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
