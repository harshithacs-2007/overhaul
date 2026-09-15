#!/usr/bin/env python3
"""Conservative dataset adapter profiles for OVERHAUL.

Profiles only provide column-name aliases. They do not invent units or values.
Use with profile_tabular.py to audit a local table before promoting mappings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class FieldProfile:
    canonical: str
    aliases: tuple[str, ...]


COMMON = (
    FieldProfile("timestamp", ("timestamp", "datetime", "date_time", "time", "date")),
    FieldProfile("power_kw", ("power_kw", "power", "electrical_power", "electric_power", "kw")),
    FieldProfile("energy_kwh", ("energy_kwh", "energy", "electricity", "kwh")),
    FieldProfile("temperature_c", ("temperature_c", "temperature", "temp_c", "temp", "air_temperature")),
    FieldProfile("relative_humidity", ("relative_humidity", "rh", "humidity", "relativehumidity")),
    FieldProfile("flow_m3h", ("flow_m3h", "flow", "flow_rate", "water_flow", "airflow")),
    FieldProfile("supply_temp_c", ("supply_temp_c", "supply_temp", "supply_temperature")),
    FieldProfile("return_temp_c", ("return_temp_c", "return_temp", "return_temperature")),
    FieldProfile("load_kw", ("load_kw", "load", "thermal_load_kw", "cooling_load_kw", "heating_load_kw")),
    FieldProfile("rated_capacity_kw", ("rated_capacity_kw", "capacity_kw", "rated_capacity", "capacity")),
)

PROFILES: dict[str, tuple[FieldProfile, ...]] = {
    "nasa_power": COMMON,
    "rescast": COMMON,
    "lbnl_fdd": COMMON,
    "ttm4hvac": COMMON,
    "cu_bems": COMMON,
    "ashrae_gepiii": COMMON,
    "remdb": (
        FieldProfile("measure", ("measure", "retrofit", "measure_name", "name")),
        FieldProfile("cost", ("cost", "cost_usd", "cost_inr", "installed_cost")),
        FieldProfile("energy_saving", ("energy_saving", "energy_savings", "savings")),
        FieldProfile("embodied_carbon", ("embodied_carbon", "embodied_carbon_kgco2e", "ghg")),
    ),
}


def normalize_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(header).strip().lower()).strip("_")


def profile_fields(profile: str, headers: list[str]) -> dict[str, str]:
    fields = PROFILES.get(profile, COMMON)
    normalized = {normalize_header(h): h for h in headers}
    result: dict[str, str] = {}
    for field in fields:
        for alias in field.aliases:
            found = normalized.get(normalize_header(alias))
            if found:
                result[field.canonical] = found
                break
    return result
