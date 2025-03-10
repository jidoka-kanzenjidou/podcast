import os
import requests

# Directory to save images
output_folder = 'sample_data'
os.makedirs(output_folder, exist_ok=True)

# Base URL with query params, we'll modify 'index' in the loop
base_url = "https://http-fotosutokku-kiban-production-80.schnworks.com/search"

# Fixed query parameters
params = {
    "query": "Intel",
    "limit": 10,
    "output": "image"
}

# Loop through index 0 to 9
for index in range(10):
    params["index"] = index  # Set current index

    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()

        # Save image to disk
        filename = f"puppy_{index}.jpg"
        file_path = os.path.join(output_folder, filename)

        with open(file_path, "wb") as file:
            file.write(response.content)

        print(f"Downloaded image {index + 1} -> {file_path}")

    except requests.RequestException as e:
        print(f"Failed to download image {index + 1}: {e}")

print("Download complete!")
