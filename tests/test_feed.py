"""Build publishes data/ files + feed.json manifest. Uses a synthetic CSV and
skips entirely if a real data/ folder exists, so committed data is never touched."""
import hashlib, json, shutil, subprocess
from pathlib import Path
import pytest

ROOT = Path(__file__).parent.parent
DATA = ROOT / "data"
DIST = ROOT / "dist"

SAMPLE_CSV = "Code,Name,S,M,L\nK5119,Silk Kurta,2,0,5\nE2001,Ethnic Set,1,3,0\n"

pytestmark = pytest.mark.skipif(
    DATA.exists(), reason="real data/ folder present — not touching it"
)


@pytest.fixture(scope="module", autouse=True)
def build_with_data():
    DATA.mkdir()
    (DATA / "store.csv").write_text(SAMPLE_CSV, encoding="utf-8")
    try:
        result = subprocess.run(
            ["python3", str(ROOT / "build-standalone.py")],
            capture_output=True, text=True, cwd=ROOT,
        )
        assert result.returncode == 0, f"Build failed:\n{result.stderr}"
        yield
    finally:
        shutil.rmtree(DATA, ignore_errors=True)
        # Remove the published sample from dist/ too — leaving it behind would
        # deploy fixture data as a live feed that overwrites real device stock.
        shutil.rmtree(DIST / "data", ignore_errors=True)


def test_data_file_copied_to_dist():
    assert (DIST / "data" / "store.csv").read_text() == SAMPLE_CSV


def test_feed_json_describes_store_file():
    feed = json.loads((DIST / "data" / "feed.json").read_text())
    assert "store" in feed
    assert feed["store"]["file"] == "store.csv"
    assert "updated" in feed["store"]


def test_feed_hash_matches_file_content():
    feed = json.loads((DIST / "data" / "feed.json").read_text())
    expected = hashlib.md5(SAMPLE_CSV.encode()).hexdigest()[:12]
    assert feed["store"]["hash"] == expected


def test_online_absent_when_no_online_file():
    feed = json.loads((DIST / "data" / "feed.json").read_text())
    assert "online" not in feed


def test_feed_js_inlined_in_built_html():
    html = (DIST / "index.html").read_text()
    assert "checkRemoteFeed" in html
