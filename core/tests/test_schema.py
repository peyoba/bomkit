# -*- coding: utf-8 -*-
from bomcore.schema import ProfileError, validate_input_profile, validate_output_template
import pytest


def test_bom_input_missing_required_field_raises():
    profile = {
        "kind": "bom_input",
        "column_map": {"Name": "value", "Designator": "designator"},  # 缺 qty/footprint
    }
    with pytest.raises(ProfileError) as exc:
        validate_input_profile(profile)
    assert exc.value.code == "MISSING_REQUIRED_FIELD"


def test_bom_input_with_all_required_fields_passes():
    profile = {
        "kind": "bom_input",
        "column_map": {
            "Name": "value", "Designator": "designator",
            "Quantity": "qty", "Footprint": "footprint",
        },
    }
    validate_input_profile(profile)  # 不抛异常


def test_material_input_missing_spec_raises():
    profile = {"kind": "material_input", "column_map": {"编码": "code"}}
    with pytest.raises(ProfileError) as exc:
        validate_input_profile(profile)
    assert exc.value.code == "MISSING_REQUIRED_FIELD"


def test_output_template_missing_columns_raises():
    with pytest.raises(ProfileError):
        validate_output_template({"kind": "output_template", "data_start_row": 5})
