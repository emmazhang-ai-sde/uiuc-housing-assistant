"""
scripts/check_token_lengths.py

验证当前房源 text 字段的 token 长度分布，
确认是否真的超过 all-MiniLM-L6-v2 的 256 token 限制。

Run:
    python -m scripts.check_token_lengths
"""

import sqlite3
from pathlib import Path
from transformers import AutoTokenizer
from config import EMBED_MODEL, SNAPSHOTS_DIR

TOKENIZER_MAP = {
    "all-MiniLM-L6-v2":   "sentence-transformers/all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5": "BAAI/bge-small-en-v1.5",
}

TOKEN_LIMIT = 256  # all-MiniLM-L6-v2 的实际序列上限


def load_texts(snapshots_dir: str) -> list[dict]:
    latest = (Path(snapshots_dir) / "latest.txt").read_text().strip()
    db_path = Path(snapshots_dir) / f"listings_{latest}.db"
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT address, unit_type, text FROM listings"
    ).fetchall()
    conn.close()
    return [{"address": r[0], "unit_type": r[1], "text": r[2] or ""} for r in rows]


def analyze(texts: list[dict], tokenizer, limit: int):
    lengths = []
    for row in texts:
        ids = tokenizer.encode(row["text"], add_special_tokens=True)
        lengths.append((len(ids), row))

    lengths.sort(key=lambda x: x[0], reverse=True)
    all_lens = [l for l, _ in lengths]
    over = [(l, r) for l, r in lengths if l > limit]

    total = len(all_lens)
    print(f"\n{'='*60}")
    print(f"  数据源快照:  {(Path(SNAPSHOTS_DIR) / 'latest.txt').read_text().strip()}")
    print(f"  当前模型:    {EMBED_MODEL}  (token 上限 {limit})")
    print(f"  总房源数:    {total}")
    print(f"{'='*60}")
    print(f"  最大 token 数:   {max(all_lens)}")
    print(f"  中位 token 数:   {sorted(all_lens)[total // 2]}")
    print(f"  平均 token 数:   {sum(all_lens) / total:.1f}")
    print(f"  最小 token 数:   {min(all_lens)}")
    print(f"  超过 {limit} 的房源: {len(over)} / {total}  ({len(over)/total*100:.1f}%)")

    if over:
        print(f"\n--- 超限房源（前 10 条）---")
        for length, row in over[:10]:
            truncated_text = row["text"][:120].replace("\n", " ")
            print(f"  [{length:>4} tok]  {row['address']} | {row['unit_type']}")
            print(f"           text: {truncated_text}...")
    else:
        print(f"\n  所有房源均在 {limit} token 以内。")

    # 分布直方图（bucket）
    print(f"\n--- Token 长度分布 ---")
    buckets = [0, 64, 128, 192, 256, 320, 384, 512, 9999]
    labels  = ["0–63", "64–127", "128–191", "192–255",
               "256–319", "320–383", "384–511", "512+"]
    counts = [0] * len(labels)
    for l in all_lens:
        for i in range(len(buckets) - 1):
            if buckets[i] <= l < buckets[i + 1]:
                counts[i] += 1
                break
    for label, count in zip(labels, counts):
        bar = "█" * (count * 30 // max(counts)) if max(counts) > 0 else ""
        marker = "  ← 超限" if label in ("256–319", "320–383", "384–511", "512+") else ""
        print(f"  {label:>8}: {count:>4}  {bar}{marker}")


def main():
    print("加载快照数据...")
    texts = load_texts(SNAPSHOTS_DIR)
    print(f"共 {len(texts)} 条房源")

    model_id = TOKENIZER_MAP.get(EMBED_MODEL, f"sentence-transformers/{EMBED_MODEL}")
    print(f"加载 tokenizer: {model_id}")
    tokenizer = AutoTokenizer.from_pretrained(model_id)

    analyze(texts, tokenizer, TOKEN_LIMIT)


if __name__ == "__main__":
    main()
