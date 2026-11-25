# Heliofield

Single-page PV cleaning decision support. The application calculates in the browser. Imported farm data stays on the operator’s device.

## Run

From this directory run **npm start** and open http://127.0.0.1:4173. This uses Python 3’s built-in static server. **npm test** runs the model and import regressions using Node 20 or later. No package installation is required.

Deploy this directory on Vercel with the **Other** framework preset. The included configuration serves the public directory directly. The shipped reference dataset and web assets are self-contained.

## Operator workflow

The opening view is the 14 August 2025 Dubai reference decision. Use the date arrows to change the issue date. Inspect the calculation or test when an effective rainfall would erase the benefit. The payback field always shows the dry-outlook break-even day. The rain slider changes only the selected decision scenario.

In **Farm settings → My farm**, download the example CSV and open the column guide. Supply 7–732 complete UTC days with hourly expected clean DC kW, PM10, PM2.5, rainfall and recorded washes. Enter the block’s tariff, wash cost, operating voltage and inverter AC limit. Review its tilt, system losses, rain-reset threshold, initial soiling and wash efficiency. A fresh upload opens the decision immediately after the final complete day. Editing an existing profile re-evaluates the selected date.

Use **Inspect decision** for the engineering and economic calculation, a paired-string ampere cross-check, and a day-by-day CSV export. The history can export all dry signals through the selected date or just positive wash signals.

## Calculation

The reference repeats a trailing seven-day mean hourly clean-power and particulate deposition profile. HSU transmission converts deposited mass to output loss. Each path clips AC output at the inverter. A wash is economic when incremental AC energy value exceeds the wash cost. The reference replay applies its own dry recommendations. Imported histories follow the recorded wash flags. A wash removes the configured fraction of accumulated mass. Effective rain clears both paths at the start of the selected forecast day.

The current readout is the difference in equivalent DC current at the peak hour of the mean reference-power profile with the configured operating voltage held constant. Operators can separately compare matched clean and soiled string readings in the decision detail. The Dubai case assumes 800 V for the current readout. Dispatch is advisory.

## Reproducibility and sources

The 2025 reference is extracted from the project’s hourly solar/weather/CAMS archive. To rebuild it, place this folder beside the original solar_weather_CAMS_soiling_2025_hourly.csv and run **python3 tools/build_reference.py**. The 10 MWp DC replay reproduces the original daily economic scheduler, including five wash signals and approximately AED 156,915 simulated annual net value against rain alone.

Weather and irradiance come from [NASA POWER](https://power.larc.nasa.gov/). Contains modified Copernicus Atmosphere Monitoring Service information (2025), delivered by [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The physics follows the [HSU fixed-velocity formulation](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.soiling.hsu.html). The generated array photograph is illustrative. DM Sans is distributed with its SIL Open Font License in public/assets.
