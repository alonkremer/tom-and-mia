"""מכין תמונה לאתר: מקטין לרוחב 1000px, מיישר לפי EXIF, מנקה מטא-דאטה ושומר ב-images/ בשם של המיקום.

שימוש:
    python tools/add-photo.py <מיקום> "<נתיב לתמונה החדשה>"

מיקום: 1 = למעלה מימין, 2 = למעלה משמאל, 3 = למטה מימין, 4 = למטה משמאל
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

SLOTS = {
    "1": "photo-1-top-right.jpg",
    "2": "photo-2-top-left.jpg",
    "3": "photo-3-bottom-right.jpg",
    "4": "photo-4-bottom-left.jpg",
}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in SLOTS:
        sys.exit(__doc__)
    target = Path(__file__).resolve().parent.parent / "images" / SLOTS[sys.argv[1]]
    img = ImageOps.exif_transpose(Image.open(sys.argv[2])).convert("RGB")
    if img.width > 1000:
        img = img.resize((1000, round(img.height * 1000 / img.width)), Image.LANCZOS)
    img.save(target, "JPEG", quality=84, optimize=True, progressive=True)
    print(f"{target}  ({img.width}x{img.height}, {target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
