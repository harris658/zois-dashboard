import subprocess, json
from pathlib import Path
import pytest
from PIL import Image

ROOT = Path(__file__).parent.parent
DIST = ROOT / "dist"

@pytest.fixture(scope="module", autouse=True)
def build():
    import shutil
    shutil.rmtree(DIST, ignore_errors=True)
    result = subprocess.run(
        ["python3", str(ROOT / "build-standalone.py")],
        capture_output=True, text=True, cwd=ROOT
    )
    assert result.returncode == 0, f"Build failed:\n{result.stderr}"

def test_dist_folder_exists():
    assert DIST.is_dir()

def test_index_html_exists():
    assert (DIST / "index.html").exists()

def test_index_html_has_manifest_link():
    html = (DIST / "index.html").read_text()
    assert 'rel="manifest"' in html

def test_index_html_has_inlined_css():
    html = (DIST / "index.html").read_text()
    assert '<style>' in html
    assert 'href="css/' not in html

def test_index_html_has_sw_registration():
    html = (DIST / "index.html").read_text()
    assert "serviceWorker" in html
    assert "sw.js" in html

def test_manifest_json_valid():
    manifest = json.loads((DIST / "manifest.json").read_text())
    assert manifest["name"] == "ZOIS Dashboard"
    assert manifest["display"] == "standalone"
    assert manifest["theme_color"] == "#5a2c0a"
    assert len(manifest["icons"]) == 2

def test_sw_js_exists():
    assert (DIST / "sw.js").exists()

def test_icon_192_correct_size():
    img = Image.open(DIST / "icons" / "icon-192.png")
    assert img.size == (192, 192)

def test_icon_512_correct_size():
    img = Image.open(DIST / "icons" / "icon-512.png")
    assert img.size == (512, 512)
