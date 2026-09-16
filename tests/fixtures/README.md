# OVERHAUL validation fixtures

These fixtures are deterministic regression inputs for the product demo and the engineering validation report.

## Ground-truth rule

The fixture truth is known before OVERHAUL sees the case. Never change the expected values after observing an OVERHAUL result.

## Cases

- `room-hvac.svg` — synthetic room/equipment visual reference with labelled ground-truth geometry.
- `pump-skid.svg` — synthetic industrial pump skid reference.
- `chiller-plant.svg` — synthetic plant/equipment reference.
- `engineering-cases.json` — independent numeric ground truth for deterministic physics checks.

## Metrics to report

1. Vision object precision/recall against labelled fixture objects.
2. Geometry absolute error and relative error against the labelled dimensions.
3. Unit parsing success rate.
4. Invalid-input rejection rate.
5. Physics calculation relative error against independently calculated ground truth.
6. Scan persistence / recovery success rate.
7. End-to-end latency by stage.

Do not report a model accuracy percentage from these fixtures unless the corresponding ground truth and sample count are shown.
