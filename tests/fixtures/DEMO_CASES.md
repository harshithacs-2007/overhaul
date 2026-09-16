# OVERHAUL controlled demo cases

Use these fixed cases for the website walkthrough and presentation screenshots. Keep the inputs unchanged when recording results.

## Case A — Office HVAC room

Upload: `room-hvac.svg`

Select: Building → Office → Retrofit

Visible ground truth:

- AHU: 1.20 m × 0.80 m × 1.60 m
- AHU airflow: 1200 CFM
- Fan: 0.75 kW
- Electrical panel: 415 V
- Duct: 600 mm × 300 mm

What to capture:

- detected visible assets
- extracted visible values
- twin geometry status
- warnings/next-evidence requests

Do not claim that the image establishes hidden COP, efficiency, pressure, temperature, or load.

## Case B — Industrial pump + motor

Upload: `pump-skid.svg`

Select: Facility/Equipment → Manufacturing → Retrofit

Visible ground truth:

- Centrifugal pump: 1.10 m × 0.70 m × 0.95 m
- Motor load: 18.0 kW
- Motor rated power: 25.0 kW
- Motor efficiency: 0.72

Deterministic engineering baseline:

- annual operating hours: 4200 h/year
- electricity rate: ₹9/kWh
- annual energy: 105,000 kWh/year
- annual energy cost: ₹945,000/year

Counterfactual example:

- proposed efficiency: 0.84
- proposed annual energy: 90,000 kWh/year
- annual energy saving: 15,000 kWh/year
- annual cost saving: ₹135,000/year

These engineering values are controlled calculation inputs, not values the image alone proves.

## Case C — Chiller plant topology

Upload: `chiller-plant.svg`

Select: Facility → Industrial/Commercial → Retrofit

Visible ground truth:

- Chiller: 350 kW capacity, COP 4.2, 2.40 m × 1.10 m × 1.80 m
- Pump: 18 kW
- Cooling tower: visible and connected to the chiller/pump path

What to capture:

- detected plant assets
- topology/connection interpretation
- geometry status
- evidence gaps

## Case D — Pump operating dataset

Upload: `pump-timeseries.csv`

Use the dataset-evidence path.

Known dataset facts:

- 10 hourly rows
- power: 14.8–18.0 kW
- flow: 0.021–0.025 m³/s
- suction pressure: 180–186 kPa
- discharge pressure: 420–430 kPa

Expected deterministic structure:

- 10 data rows
- 5 columns
- one timestamp field with 1-hour cadence

Do not interpret correlation or short-sample statistics as causal retrofit savings.

## Recording protocol

For every run, record the fixture name, configuration/model, input values, output values, warnings, failure mode if any, and elapsed time. Keep the original output screenshot. Only calculate accuracy after the raw outputs are frozen.
