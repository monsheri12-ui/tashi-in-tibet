CURRENT TRAINER UPDATE — 11 NOVEMBER 2026

Published page: https://foxsaywawa.tilda.ws/page201712509.html
Current final source: tilda-final.html in this directory, copied to
outputs/tilda-trainer-monlam.html and work/tilda-201712509-monlam.html.
Current URLs and pinned commits: work/monlam-jorlok-hosting.json.

Very Slow is a reading profile. Whole words use the clarity-supported WAV
sources from BEFORE the historical .78 time-stretch pass. Other fragments
use the approved ordinary recordings, with three timing-preserving cleanup
exceptions documented in native-fragment-repairs.json. The client always
plays at rate 1; Jorlok retains the longer gaps between steps and syllables.

All five prefix names in both voices use approved-prefixes/*.wav.
The same encoded prefix clip is used in normal, slow, and very-slow spelling
banks. Female ka-o: female-kao-native-20261111.wav; male ka-o:
male-kao-native-v3-20261111.wav. Both were accepted by the user. Do not use
the rejected older first-prefix candidates from the earlier auditions.

The sha btsir / sha btsir rgyag re-recording proposal was cancelled by the
user before generating anything. No new recordings or spelling changes
were made for these two expressions. Only the full construction receives
the button caption “Словосочетание”. This is a structural analysis, not a
claim of finding an exact dictionary headword; see phrase-label-evidence.json.

Build order in this directory: build.py, prepare-prefixes.py (it prefers the
accepted recordings under approved-prefixes), repair-native-fragments.py,
verify.py. Then patch-trainer.py and pin the new asset commit. The older
word-clarity-followup-20261111/very-slow build remains historical evidence;
do not republish its stretched audio as the current profile.

Verification: public-live-verification.json, verification.json, and
client-verification.json. Automatic acoustic checks do not certify the
phonetic correctness of the entire corpus.
