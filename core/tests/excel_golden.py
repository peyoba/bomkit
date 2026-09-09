"""公司主表黄金签名：只比较语义样式，不比较openpyxl内部styleId。"""

import hashlib
import json
from copy import copy

from openpyxl.xml.functions import tostring


def sheet_signature(ws):
    cells = {}
    for row in ws:
        for cell in row:
            style = [
                tostring(copy(getattr(cell, name)).to_tree()).decode()
                for name in ("font", "fill", "border", "alignment", "protection")
            ]
            style.append(cell.number_format)
            digest = hashlib.sha256(json.dumps(style, ensure_ascii=False).encode()).hexdigest()[:20]
            cells[cell.coordinate] = [cell.value, cell.data_type, digest]
    return {
        "rows": ws.max_row,
        "cols": ws.max_column,
        "cells": cells,
        "merges": sorted(str(v) for v in ws.merged_cells.ranges),
        "widths": {k: v.width for k, v in ws.column_dimensions.items()},
        "heights": {str(k): v.height for k, v in ws.row_dimensions.items()},
    }
