import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from app.services.ingestion import load_file


class SpreadsheetIngestionTests(unittest.TestCase):
    def test_loads_nonempty_sheets_as_documents(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "knowledge.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Tuition"
            sheet.append(["Fee", "Amount"])
            sheet.append(["Tuition", 1200])
            workbook.save(path)

            documents = load_file(str(path))

        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0].metadata["sheet"], "Tuition")
        self.assertEqual(
            documents[0].page_content,
            "Fee\tAmount\nTuition\t1200",
        )


if __name__ == "__main__":
    unittest.main()
