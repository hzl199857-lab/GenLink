import json
import sqlite3
from pathlib import Path


DB_PATH = Path(r"E:\GenLink\prisma\prisma\dev.db")
BROKEN_PREFIX = "data:image/png;base64,data:image/"


def normalize_image_url(value: str) -> str:
    if not isinstance(value, str):
        return value

    if value.startswith(BROKEN_PREFIX):
        return value.replace("data:image/png;base64,", "", 1)

    return value


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        select id, result
        from ImageJob
        where result like '%data:image/png;base64,data:image/%'
        """
    ).fetchall()

    updated = 0

    for row in rows:
        payload = json.loads(row["result"])
        images = payload.get("images")

        if not isinstance(images, list):
            continue

        changed = False

        for image in images:
            if not isinstance(image, dict):
                continue

            image_url = image.get("imageUrl")
            normalized = normalize_image_url(image_url)

            if normalized != image_url:
                image["imageUrl"] = normalized
                changed = True

        if not changed:
          continue

        conn.execute(
            "update ImageJob set result = ? where id = ?",
            (json.dumps(payload, ensure_ascii=False, separators=(",", ":")), row["id"]),
        )
        updated += 1

    conn.commit()
    conn.close()
    print(f"updated={updated}")


if __name__ == "__main__":
    main()
