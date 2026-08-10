VERA PACHAMANCA STATIC WEBSITE PROTOTYPE
========================================

Files:
- index.html      Main homepage and Friday-Monday schedule (September 4-7, 2026)
- photos.html     Reunion-year photo archive
- gallery.html    Sample photo gallery
- login.html      Login design preview
- css/styles.css  All site styling
- js/main.js      Mobile menu, schedule tabs, countdown, gallery preview

HOW TO VIEW LOCALLY
-------------------
1. Extract the ZIP file.
2. Open the extracted folder.
3. Double-click index.html.

You can also open the folder in Visual Studio Code and use the Live Server extension.

IMPORTANT
---------
This is a static design prototype only.
- The dates, locations, events, and reunion years are sample content.
- Login does not authenticate.
- Uploads are not connected.
- No API or database is required to view the design.

NEXT DEVELOPMENT PHASE
----------------------
After approving the design:
1. Replace sample event data with an API call.
2. Connect PostgreSQL for event records.
3. Add authentication.
4. Add image resizing and photo storage.

- goldenpachamanca.html  Local placeholder for pages imported from goldenpachamanca.com


GOLDEN PACHAMANCA HISTORICAL ARCHIVE
------------------------------------
- goldenpachamanca.html       Introduction
- golden-pachamanca.html      Pachamanca cooking tradition
- golden-history.html         History of the Golden Pachamanca
- golden-tumbamonte.html      Chonguinada and Tumbamonte
- golden-map.html             Historical map and directions

The archive pages use images served directly from the Internet Archive Wayback Machine.
The background image of Sam Vera is included locally at images/sam-vera-1969.png.

PHOTO DESIGN UPDATE
-------------------
- photos.html: public year archive
- gallery.html?year=YYYY: public gallery with notes and uploader names
- upload.html: signed-in upload prototype with a separate year and optional note for each photo
- Years range from Before 1980 and 1980 through the present. Missing years will be created by the future API.
