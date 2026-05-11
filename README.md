# chemdoomscroller

doomscroll-style IB chemistry SL review. one swipe = one question.

## stack
- plain html / css / js
- github pages
- json data files in `/data/qae/<unit>/<topic>/qXX.json`

## file structure
```
/index.html
/style.css
/app.js
/.nojekyll
/data/
  index.json
  qae/
    unit01-stoichiometric-relationships/
      the-mole-concept/
        q01.json ... q10.json
      ...
    unit02-atomic-structure/
      ...
```

## question json shape
```json
{
  "q": "What is the molar mass of CO2?",
  "options": ["28 g/mol", "44 g/mol", "32 g/mol", "16 g/mol"],
  "correct": 1,
  "explanation": "C (12) + 2*O (16) = 44 g/mol"
}
```

`correct` is the 0-indexed position of the right answer.

## how it works
1. on load, fetches `index.json`
2. builds a flat pool of all `{unit, topic, file}` pointers across filtered topics
3. fisher-yates shuffles the pool — pure random order
4. lazy-fetches each question json as cards render
5. caches fetched questions in a `Map` (no re-fetch on scroll back)
6. when within 2 viewports of the bottom, appends 3 more cards
7. empty placeholder questions render with a hint so you can spot un-filled files

## adding questions
just edit any `qXX.json` file. no rebuild needed.

if you add new topics or units, regen index.json — or write any new files following the existing naming pattern and add a corresponding entry to `data/index.json`.

## deploy
push to main. github pages auto-serves from root.
make sure `.nojekyll` is in root so the data folder isn't ignored.
