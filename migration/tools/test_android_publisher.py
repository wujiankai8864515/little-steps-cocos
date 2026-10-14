"""Publication recovery checks for GitHub draft lookup and exhausted/error reads."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('android_publish', ROOT / 'builds/android/publish.py')
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)
REPOSITORY = 'wujiankai8864515/little-steps-cocos'
TAG = 'avg-plus-android-0.1.0.6'


class AndroidPublisherTests(unittest.TestCase):
    def test_published_release_uses_the_tag_readback(self):
        release = {'tag_name': TAG, 'id': 6, 'draft': False, 'assets': [{'name': 'game.zip'}]}
        with patch.object(PUBLISH, 'gh', return_value=json.dumps(release)) as github:
            self.assertEqual(PUBLISH.api(REPOSITORY, TAG), release)
        self.assertEqual(github.call_count, 1)

    def test_tag_404_recovers_the_existing_draft_on_a_later_page_and_refreshes_assets(self):
        first = [{'tag_name': 'other-' + str(i), 'id': i} for i in range(100)]
        draft = {'tag_name': TAG, 'id': 600, 'draft': True, 'assets': []}
        refreshed = {**draft, 'assets': [{'name': 'avg-plus-assets.zip', 'state': 'uploaded', 'size': 32105632}]}
        replies = [None, json.dumps(first), json.dumps([draft]), json.dumps(refreshed)]
        with patch.object(PUBLISH, 'gh', side_effect=replies) as github:
            actual = PUBLISH.api(REPOSITORY, TAG)
        self.assertEqual(actual, refreshed)
        self.assertEqual(github.call_args_list[-1].args, ('api', f'repos/{REPOSITORY}/releases/600'))
        self.assertIn('page=2', github.call_args_list[-2].args[1])

    def test_absence_is_confirmed_only_after_a_successful_complete_listing(self):
        with patch.object(PUBLISH, 'gh', side_effect=[None, '[]']) as github:
            self.assertIsNone(PUBLISH.api(REPOSITORY, TAG))
        self.assertEqual(github.call_count, 2)

    def test_failed_listing_is_not_treated_as_an_absent_release(self):
        with patch.object(PUBLISH, 'gh', side_effect=[None, RuntimeError('HTTP 503')]):
            with self.assertRaisesRegex(RuntimeError, 'HTTP 503'):
                PUBLISH.api(REPOSITORY, TAG)

    def test_draft_id_cannot_resolve_to_a_different_tag(self):
        replies = [None, json.dumps([{'tag_name': TAG, 'id': 600}]),
                   json.dumps({'tag_name': 'different', 'id': 600})]
        with patch.object(PUBLISH, 'gh', side_effect=replies):
            with self.assertRaisesRegex(ValueError, 'tag readback differs'):
                PUBLISH.api(REPOSITORY, TAG)


if __name__ == '__main__':
    unittest.main()
