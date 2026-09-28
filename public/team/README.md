# Team portraits

Drop the three headshots in here with exactly these names:

    ethan-young.jpg
    max-lynch.jpg
    ryan-searcy.jpg

`.png` also works; the page checks for both. Square crops are best (the CSS
masks them into a circle). Anything from about 400x400 up is plenty.

The team page checks for each file at render time. When a file is missing it
falls back to a monogram, so the page never shows a broken image and no code
change is needed when a portrait is added or swapped.

See app/sandbox/(editorial)/team/page.tsx.
