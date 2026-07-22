@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo BEU 2024 sablonu ile Etherescan tez Word dosyasi olusturuluyor...
echo.

py -3 -m pip install python-docx --quiet
if errorlevel 1 (
  echo HATA: python-docx kurulamadi. Python 3 yuklu mu kontrol edin.
  pause
  exit /b 1
)

py -3 docs\build_thesis_docx.py
if errorlevel 1 (
  echo.
  echo HATA: Word dosyasi olusturulamadi. Yukaridaki hata mesajini kontrol edin.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\OneDrive\Desktop\Etherescan_Diploma_Calismasi.docx" (
  echo.
  echo Tamamlandi:
  echo %USERPROFILE%\OneDrive\Desktop\Etherescan_Diploma_Calismasi.docx
  echo.
  echo Word aciliyor...
  start "" "%USERPROFILE%\OneDrive\Desktop\Etherescan_Diploma_Calismasi.docx"
) else (
  echo HATA: Cikti dosyasi bulunamadi.
  pause
  exit /b 1
)
