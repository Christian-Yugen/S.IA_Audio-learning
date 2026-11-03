import json
import sys
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch, Mock
from server import Engine, handler_for, validate_request


class Tests(unittest.TestCase):
    def test_valid_video_only(self):
        self.assertEqual(validate_request({'videoId': 'xl4dvczQWOA', 'start': 30}), ('xl4dvczQWOA', 30))
        for body in [{'videoId': 'http://localhost'}, {'videoId': 'xl4dvczQWOA', 'start': -1},
                     {'videoId': 'xl4dvczQWOA', 'start': float('nan')}, {'videoId': 'xl4dvczQWOA', 'start': True}]:
            with self.assertRaises(ValueError): validate_request(body)

    def test_real_engine_orchestration_offsets_and_cache(self):
        engine = Engine()
        engine.model = Mock()
        engine.model.transcribe.return_value = {'language': 'en', 'segments': [
            {'start': 1, 'end': 3, 'text': 'Hello'},
            {'start': 4, 'end': 8, 'text': 'Hallucination', 'no_speech_prob': .9}]}
        metadata = Mock(stdout=json.dumps({'url': 'https://audio.example/test', 'duration': 65}))
        with patch('server.subprocess.run', return_value=metadata) as run:
            result = engine.transcribe('xl4dvczQWOA', 30)
            self.assertEqual(result['cues'], [{'text': 'Hello', 'startTime': 31., 'endTime': 33.}])
            self.assertEqual(result['end'], 60)
            self.assertFalse(result['done'])
            self.assertEqual(engine.transcribe('xl4dvczQWOA', 30), result)
            self.assertEqual(run.call_count, 2)
            self.assertIn('30', run.call_args_list[1].args[0])
            engine.model.transcribe.assert_called_once()

    def test_http_auth_validation_and_success(self):
        engine = Mock()
        engine.transcribe.return_value = {'cues': [], 'start': 0, 'end': 30, 'language': 'en', 'done': False}
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(engine, 'test-token'))
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        def request(body, token='test-token'):
            req = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/transcribe',
                json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + token})
            return urllib.request.urlopen(req)
        try:
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({'videoId': 'xl4dvczQWOA'}, 'wrong')
            self.assertEqual(error.exception.code, 401)
            with self.assertRaises(urllib.error.HTTPError) as error:
                request({'videoId': 'https://evil.example'})
            self.assertEqual(error.exception.code, 400)
            self.assertEqual(json.load(request({'videoId': 'xl4dvczQWOA'}))['end'], 30)
            engine.transcribe.assert_called_once_with('xl4dvczQWOA', 0.)
        finally:
            server.shutdown(); server.server_close()

    def test_busy_engine_rejects_parallel_work(self):
        engine = Engine()
        engine.lock.acquire()
        try:
            with self.assertRaises(RuntimeError): engine.transcribe('xl4dvczQWOA', 0)
        finally: engine.lock.release()


if __name__ == '__main__': unittest.main()
