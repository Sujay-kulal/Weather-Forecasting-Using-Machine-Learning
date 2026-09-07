"""
Kaggle Dataset Fetcher - Downloads the training dataset from Kaggle
====================================================================
Downloads 'PSP_Weather_Merged_EDA_Cleaned.csv' from the Kaggle dataset:
  ivaibhavporwal/weather-driven-indian-power-demand-dataset

This script is the SINGLE SOURCE OF TRUTH for obtaining the training data.
It is called automatically by train_model.py if the CSV is missing, or
can be run standalone to refresh the dataset.

Prerequisites:
  - pip install kaggle
  - Set KAGGLE_API_TOKEN env var, or save token to ~/.kaggle/access_token

Usage:
  python fetch_data.py              # download only if CSV is missing
  python fetch_data.py --force      # re-download even if CSV exists

Kept simple for project viva - just downloads and extracts one file.
"""

import os
import sys
import zipfile
import shutil

# --- Configuration ---
KAGGLE_DATASET = "ivaibhavporwal/weather-driven-indian-power-demand-dataset"
DATA_DIR = os.path.join("data", "archive_c")
TARGET_CSV = "PSP_Weather_Merged_EDA_Cleaned.csv"
TARGET_PATH = os.path.join(DATA_DIR, TARGET_CSV)


def download_dataset(force=False):
    """
    Download the Kaggle dataset and extract only the CSV we need.
    Returns the path to the CSV file.
    
    Why Kaggle API instead of a static file in the repo?
      - The CSV is ~3.8 MB and doesn't belong in version control
      - Kaggle is the authoritative source maintained by the dataset author
      - Anyone cloning the repo can reproduce the exact same dataset
      - This is standard practice in real ML projects (kept simple for viva)
    """
    if os.path.exists(TARGET_PATH) and not force:
        print(f"   Dataset already exists at {TARGET_PATH}, skipping download.")
        print(f"   (Use --force or fetch_data.py --force to re-download)")
        return TARGET_PATH

    # Check that the kaggle package is installed
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
    except ImportError:
        sys.exit(
            "ERROR: 'kaggle' package not installed.\n"
            "  Run: pip install kaggle\n"
            "  Then set KAGGLE_API_TOKEN or save token to ~/.kaggle/access_token"
        )

    print(f"   Downloading dataset from Kaggle: {KAGGLE_DATASET} ...")
    
    # Authenticate with Kaggle API
    api = KaggleApi()
    api.authenticate()

    # Create data directory if it doesn't exist
    os.makedirs(DATA_DIR, exist_ok=True)

    # Download the dataset as a zip file
    # The Kaggle API downloads to the specified path
    api.dataset_download_files(KAGGLE_DATASET, path=DATA_DIR, unzip=False)

    # Find and extract only the CSV we need from the zip
    zip_path = os.path.join(DATA_DIR, "weather-driven-indian-power-demand-dataset.zip")
    if os.path.exists(zip_path):
        print(f"   Extracting {TARGET_CSV} from downloaded archive ...")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # List files in the zip to find our target
            csv_found = False
            for name in zf.namelist():
                if name.endswith(TARGET_CSV):
                    # Extract just this file
                    zf.extract(name, DATA_DIR)
                    # If it was in a subdirectory inside the zip, move it
                    extracted = os.path.join(DATA_DIR, name)
                    if extracted != TARGET_PATH:
                        shutil.move(extracted, TARGET_PATH)
                    csv_found = True
                    break

            if not csv_found:
                # If exact name not found, extract all and look for it
                zf.extractall(DATA_DIR)
                print(f"   WARNING: Extracted all files. Contents: {zf.namelist()}")

        # Clean up the zip file - we only need the CSV
        os.remove(zip_path)
        print(f"   Cleaned up zip archive.")
    else:
        # Some versions of the API unzip automatically
        if not os.path.exists(TARGET_PATH):
            sys.exit(f"ERROR: Download completed but {TARGET_CSV} not found in {DATA_DIR}")

    if not os.path.exists(TARGET_PATH):
        sys.exit(f"ERROR: {TARGET_CSV} not found after extraction. Check the dataset contents.")

    # Verify the file looks reasonable
    file_size = os.path.getsize(TARGET_PATH) / (1024 * 1024)
    print(f"   Dataset ready: {TARGET_PATH} ({file_size:.1f} MB)")
    return TARGET_PATH


if __name__ == "__main__":
    force = "--force" in sys.argv
    print("Kaggle Dataset Fetcher")
    print("=" * 50)
    path = download_dataset(force=force)
    print(f"\nDone. CSV available at: {path}")
