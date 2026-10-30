# Home photography — sources and licences

Every photograph on the Home page, where it came from, and the licence
it is used under. The page itself shows the same credits (the "Photo
credits" disclosure at the end of Home, `PhotoCredits.jsx`), built from
`apps/web/src/modules/home/constants/homeImages.js` — keep the two in
step when a photo changes.

## Selection rules

- Armenia-specific photography only; no generic "travel" stock.
- Free licences only (CC0, CC BY, CC BY-SA), each verified on the file's
  Wikimedia Commons page (licence template + `extmetadata` from the
  Commons API). No watermarked, AI-generated, unclear-licence or
  low-resolution files (every original is at least 3000 px wide).
- One distinct photo per category and per destination; nothing reused.
- Every category tile shows a real place of that kind in Armenia; a
  category or destination added later without a photo keeps its
  generated panel rather than an unrelated picture.

Source: Wikimedia Commons, through its official API. Unsplash and Pexels
were tried first and not used (no Armenia-specific results through an
allowed channel).

## Credits

| Key | Shows | Author | Licence | Commons file |
| --- | --- | --- | --- | --- |
| hero-ararat | Khor Virap and Mount Ararat | Andrew Behesnilian (MrAndrew47) | CC BY-SA 3.0 | [Khor_Virap_Monastery_and_Mount_Ararat,_Armenia.jpg](https://commons.wikimedia.org/wiki/File:Khor_Virap_Monastery_and_Mount_Ararat,_Armenia.jpg) |
| category-hotels | Armenia Marriott Hotel, Republic Square, Yerevan | Marcin Konsek | CC BY-SA 4.0 | [2014_Erywań,_Hotel_Armenia_Marriot_(02).jpg](https://commons.wikimedia.org/wiki/File:2014_Erywa%C5%84,_Hotel_Armenia_Marriot_(02).jpg) |
| category-apartments | Kentron rooftops, Yerevan | Benoît Prieur | CC0 1.0 | [A_view_of_Kentron_from_Opera_Suite_Hotel_Yerevan_(June_2023).JPG](https://commons.wikimedia.org/wiki/File:A_view_of_Kentron_from_Opera_Suite_Hotel_Yerevan_(June_2023).JPG) |
| category-villas | Houses in the forest, Dilijan | Alexxx1979 | CC BY-SA 4.0 | [Armenia._Dilijan_P8230683_2350.jpg](https://commons.wikimedia.org/wiki/File:Armenia._Dilijan_P8230683_2350.jpg) |
| category-guest-houses | Areni village | Dor Shabashewitz | CC BY 4.0 | [Areni_view.jpg](https://commons.wikimedia.org/wiki/File:Areni_view.jpg) |
| category-restaurants | Armenian lamb dishes, Yerevan | Vyacheslav Argenberg | CC BY 4.0 | [Yerevan,_Lamb_and_mutton_dishes,_Armenian_cuisine,_Armenia.jpg](https://commons.wikimedia.org/wiki/File:Yerevan,_Lamb_and_mutton_dishes,_Armenian_cuisine,_Armenia.jpg) |
| category-tours | Tatev Monastery | Diego Delso | CC BY-SA 4.0 | [Monasterio_de_Tatev,_Armenia,_2016-10-01,_DD_86-88_HDR.jpg](https://commons.wikimedia.org/wiki/File:Monasterio_de_Tatev,_Armenia,_2016-10-01,_DD_86-88_HDR.jpg) |
| category-car-rentals | Road down from the Selim Pass | Shaun Dunphy | CC BY-SA 2.0 | [Heading_down_from_the_Selim_Pass_(5128503778).jpg](https://commons.wikimedia.org/wiki/File:Heading_down_from_the_Selim_Pass_(5128503778).jpg) |
| category-attractions | Garni Temple | Matthias Süßen | CC BY-SA 4.0 | [Garni_Armenien_msu-2018-3149.jpg](https://commons.wikimedia.org/wiki/File:Garni_Armenien_msu-2018-3149.jpg) |
| category-entertainment-venues | Yerevan Opera Theatre at night | Eupator | CC BY-SA 3.0 | [NightOpera.jpg](https://commons.wikimedia.org/wiki/File:NightOpera.jpg) |
| destination-yerevan | The Cascade, Yerevan | Marcin Konsek | CC BY-SA 4.0 | [2014_Erywań,_Kaskady_(03).jpg](https://commons.wikimedia.org/wiki/File:2014_Erywa%C5%84,_Kaskady_(03).jpg) |
| destination-goris | Goris rock formations | Matheus Hobold Sovernigo | CC BY-SA 4.0 | [Goris_inhabited_rocks.jpg](https://commons.wikimedia.org/wiki/File:Goris_inhabited_rocks.jpg) |
| destination-gyumri | Holy Saviour Church, Vartanants Square, Gyumri | Hayastan Mkrtchyan | CC BY-SA 4.0 | [Church_of_the_Holy_Saviour_and_Vartanants_Square_2023-10-12.jpg](https://commons.wikimedia.org/wiki/File:Church_of_the_Holy_Saviour_and_Vartanants_Square_2023-10-12.jpg) |
| destination-vanadzor | Vanadzor in spring | Poshotenk | CC BY-SA 4.0 | [Vanadzor,_Armenia_in_spring_from_lookout_on_hill.jpg](https://commons.wikimedia.org/wiki/File:Vanadzor,_Armenia_in_spring_from_lookout_on_hill.jpg) |
| destination-sevan | Sevanavank Monastery, Lake Sevan | Անժի92 | CC BY-SA 4.0 | [Sevanavank_Monastery.jpg](https://commons.wikimedia.org/wiki/File:Sevanavank_Monastery.jpg) |
| destination-dilijan | Old Dilijan Complex | Shaun Dunphy | CC BY-SA 2.0 | [Old_Dilijan_Complex_(5062752571).jpg](https://commons.wikimedia.org/wiki/File:Old_Dilijan_Complex_(5062752571).jpg) |
| partner-landscape | Vardenis range | Emma YSU | CC BY-SA 4.0 | [Vardenis_range_Emma_YSU_(6).jpg](https://commons.wikimedia.org/wiki/File:Vardenis_range_Emma_YSU_(6).jpg) |

CC BY / CC BY-SA require attribution with a licence link and an
indication of changes. The on-page credit gives author, licence (linked)
and source page; the only change made to each file is resizing,
cropping to the layout and re-encoding, which this record notes.

## Files

`apps/web/src/assets/images/home/<key>-<width>.<avif|webp>` — generated
with sharp from each original (AVIF quality 52, WebP quality 76):

| Use | Widths |
| --- | --- |
| hero | 768, 1280, 1920, 2560 |
| category tiles | 480, 960, 1440 |
| destinations | 480, 960 |
| partner banner | 960, 1600 |

90 files, 7.2 MB on disk; a browser downloads one width of one format
per photo, chosen by `srcset`/`sizes`. To replace a photo, drop new files
under the same key and update its `credit`/`ratio` in `homeImages.js`
and its row here — no component changes.
