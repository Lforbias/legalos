import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('filter_rfb', Path(__file__).with_name('filter-rfb.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FilterTests(unittest.TestCase):
    def row(self):
        r = [''] * 30
        r[5], r[11], r[19], r[20] = '02', '6911701', 'SP', '7107'
        return r

    def test_capital_active_primary_and_secondary(self):
        r = self.row()
        self.assertTrue(module.eligible(r, '7107'))
        r[11], r[12] = '0000000', '1234567,6911701'
        self.assertTrue(module.eligible(r, '7107'))
        r[12] = '16911701'
        self.assertFalse(module.eligible(r, '7107'))

    def test_excludes_other_cities_states_and_inactive(self):
        for index, value in [(5, '08'), (19, 'RJ'), (20, '9999')]:
            r = self.row()
            r[index] = value
            self.assertFalse(module.eligible(r, '7107'))
        self.assertFalse(module.eligible([], '7107'))

if __name__ == '__main__': unittest.main()
