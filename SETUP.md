# Setup: adding the game's PDFs

The overlay reads the case's newspapers, directory and informants from your own copy of the game's PDFs. If you got the **mini** zip, they aren't included: put them in the `artifacts/` folder before you play. (The full zip already has them.)

## Where they go

Put the PDFs anywhere inside `artifacts/`, in any subfolders. For example:

```
sherlock-overlay/
  artifacts/
    B_NEWSPAPER_SH_C4/
      SH_C4_Journal_01_US_HD.pdf
      SH_C4_Journal_02_US_HD.pdf
      … up to Journal_10
    C_DIRECTORY_SH_C4/
      SH_C4_Annuaire_US_HD.pdf
    D_INFORMANTS_SH_C4/
      SH_C4_informateur_US.pdf
```

The `artifacts/` folder is created the first time you run the start script. You can also create it yourself.

## What's needed

| PDF | Recognised by a name containing | Needed? |
| --- | --- | --- |
| Newspapers (one PDF each) | `Journal` or `newspaper`, plus its number | Yes, for the Paper tab and newspaper search |
| Directory | `Annuaire` or `directory` | Yes, for the directory and its search |
| Informants | `informateur` or `informant` | Yes, for the informants |
| Board (`SH_Plan_…`) | | No: the London map image is already in `maps/` |
| Rules book | | No: the overlay doesn't use it |

The original file names from the game's download already match, so you don't need to rename anything.

## After adding them

1. Restart the start script (close its window, then run `start.bat` or `./start.sh` again). PDFs are found when the program starts.
2. In the window you should see `12 document(s) in artifacts/: paper-01 … paper-10, directory, informants`.
3. In the panel's **Paper** tab, press **Use** next to the case's paper. Newspaper dates are read from each paper's masthead.

If the window says `0 document(s)`, check that the files end in `.pdf` and sit inside `artifacts/`, not next to it.
