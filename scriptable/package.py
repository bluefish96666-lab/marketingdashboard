#!/usr/bin/env python3
"""打包 mrd-dashboard.scripting — Scripting App 脚本 zip。

格式要求（对齐官方/影视集合实证）：
- STORE 方法 (method=0), 不压缩
- flag_bits=2048 (UTF-8 文件名标志, zipfile 库会重写此项, 必须手动构造)
- zip 版本 20, DOS 日期 2020 (2026 超出 DOS 时间范围)
- 文件顺序: index.tsx, page.tsx, script.json (+ icon.png 可选)

用法: python3 package.py [输出路径]
"""
import os
import struct
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
FILES = ["index.tsx", "page.tsx", "script.json"]
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "mrd-dashboard.scripting")


def make_zip(paths: list[str], out_path: str) -> None:
    local_headers = b""
    central = b""
    offset = 0
    dosdate = ((2020 - 1980) << 9) | (1 << 5) | 1  # 2020-01-01
    dostime = 0
    for f in paths:
        data = open(f, "rb").read()
        fname = os.path.basename(f).encode("utf-8")
        crc = binascii_crc32(data)
        lh = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 2048, 0, dostime, dosdate, crc, len(data), len(data), len(fname), 0)
        lh += fname
        local_headers += lh + data
        ce = struct.pack(
            "<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 2048, 0, dostime, dosdate,
            crc, len(data), len(data), len(fname), 0, 0, 0, 0, 0o644 << 16, offset,
        )
        ce += fname
        central += ce
        offset += len(lh) + len(data)
    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(paths), len(paths), len(central), offset, 0)
    with open(out_path, "wb") as f:
        f.write(local_headers + central + eocd)


def binascii_crc32(data: bytes) -> int:
    import binascii
    return binascii.crc32(data) & 0xFFFFFFFF


if __name__ == "__main__":
    paths = [os.path.join(BASE, f) for f in FILES if os.path.exists(os.path.join(BASE, f))]
    missing = [f for f in FILES if not os.path.exists(os.path.join(BASE, f))]
    if missing:
        print(f"缺少文件: {missing}")
        sys.exit(1)
    make_zip(paths, OUT)
    print(f"打包完成: {OUT} ({os.path.getsize(OUT)} bytes)")
