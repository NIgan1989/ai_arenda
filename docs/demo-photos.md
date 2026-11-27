# Фото тестовых объектов

Тестовые объекты боевой базы (id `a10e0000-0000-4000-8001-…`) показывают реальные фото своего типа: квартира, студия, дом, хостел, гостиница, баня, сауна, банкетный зал, кафе.

- Список фото по типам и авторы: `scripts/demo-photos/photos.json`. Все фото со свободными лицензиями (CC0, CC BY, CC BY-SA) с Wikimedia Commons; фото уменьшены до 1280 px, другие изменения не вносились.
- Загрузка: workflow «Photos of the test listings» (`.github/workflows/demo-photos.yml`) запускается сам после слияния в main, если меняется список или скрипт; можно запустить вручную. Скрипт `scripts/demo-photos/seed-demo-photos.mjs` даёт каждому объекту 4 своих копии (фото владельца объекта, свой объект в R2), повторный запуск ничего не дублирует.
- Отпечатки этих фото (`media_prints`) пустые: одно и то же фото у разных тестовых объектов не считается кражей фото. Для настоящих объявлений проверка работает как раньше.

## Авторы

| Фото | Автор | Лицензия | Источник |
|---|---|---|---|
| JPAD living room.jpg | Jannahplace | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:JPAD_living_room.jpg |
| Living room (Unsplash).jpg | Jarosław Ceborski jarson | CC0 | https://commons.wikimedia.org/wiki/File:Living_room_(Unsplash).jpg |
| Brier Living Room.jpg | ChrisCaparro | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Brier_Living_Room.jpg |
| Biliothèque ALBI et bureau VOLGA.jpg | TEMAHOME President | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Bilioth%C3%A8que_ALBI_et_bureau_VOLGA.jpg |
| Brand.Darina.jpg | N.faskhutdinova | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Brand.Darina.jpg |
| Bedroom with marine puzzles on wall.jpg | aismallard | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Bedroom_with_marine_puzzles_on_wall.jpg |
| Holiday Inn Moscow Sokolniki, interiors (8034785305).jpg | jimmyweee | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Holiday_Inn_Moscow_Sokolniki,_interiors_(8034785305).jpg |
| Lake Bedroom Guatemala 2018.jpg | jjmusgrove | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Lake_Bedroom_Guatemala_2018.jpg |
| Bedroom of guesthouse.jpg | Fquasie | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Bedroom_of_guesthouse.jpg |
| Dacha with blackened wood siding (Moscow Oblast, Russia, Sept 2026) 02.jpg | Retired electrician | CC0 | https://commons.wikimedia.org/wiki/File:Dacha_with_blackened_wood_siding_(Moscow_Oblast,_Russia,_Sept_2026)_02.jpg |
| Alabuga.jpg | Julia172010 | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Alabuga.jpg |
| Kornienko house.jpg | Master lpc | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Kornienko_house.jpg |
| House in Karaganda.jpg | Aiviq-2 | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:House_in_Karaganda.jpg |
| Dacha with blackened wood siding (Moscow Oblast, Russia, Sept 2026) 06.jpg | Retired electrician | CC0 | https://commons.wikimedia.org/wiki/File:Dacha_with_blackened_wood_siding_(Moscow_Oblast,_Russia,_Sept_2026)_06.jpg |
| 20230520 Hotel room in Saint Petersburg 05.jpg | Sergey A. | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:20230520_Hotel_room_in_Saint_Petersburg_05.jpg |
| Qsh twin (10942953985).jpg | Barnacles Budget Accommodation from Ireland | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Qsh_twin_(10942953985).jpg |
| Bunked double bed with a wooden frame. (51539646151).jpg | Nenad Stojkovic | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Bunked_double_bed_with_a_wooden_frame._(51539646151).jpg |
| Bunk bed (wooden).jpg | Steven Pavlov | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Bunk_bed_(wooden).jpg |
| The cabin.jpg | Gsanjeev | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:The_cabin.jpg |
| Bunk beds (panoramio (1297)).jpg | logan watson | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Bunk_beds_(panoramio_(1297)).jpg |
| The Grove Lobby.jpg | Rockwell Land | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:The_Grove_Lobby.jpg |
| Chzlobby.JPG | ZaraHotels | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Chzlobby.JPG |
| MezzanineHotelChristianiaTeater.jpg | Orjanarvola | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:MezzanineHotelChristianiaTeater.jpg |
| Harvia Ventura sauna.jpg | Johnnidian | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Harvia_Ventura_sauna.jpg |
| Sauna in Meremäe, Setomaa.jpg | Klarqa | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Sauna_in_Merem%C3%A4e,_Setomaa.jpg |
| Sha2017-sauna.jpg | Korrupt | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Sha2017-sauna.jpg |
| Saunaskäik..jpg | Sillerkiil | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Saunask%C3%A4ik..jpg |
| Ribka.jpg | PressGPNS | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Ribka.jpg |
| Swimming pool Gan Shmuel.jpg | Laliv g | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Swimming_pool_Gan_Shmuel.jpg |
| Seaside sauna in Kirkkonummi.jpg | JIP | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Seaside_sauna_in_Kirkkonummi.jpg |
| Puri Bali Grand Ballroom at Paradisus by Meliá Bali.jpg | Paradisus Bali | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Puri_Bali_Grand_Ballroom_at_Paradisus_by_Meli%C3%A1_Bali.jpg |
| Event Hall in Colombia.jpg | PapiPijuan | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Event_Hall_in_Colombia.jpg |
| Fnp venues.jpg | Fnpvenues11 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Fnp_venues.jpg |
| M4ROOT.00 00 26 19.Still004.jpg | Mahmoud123hissein | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:M4ROOT.00_00_26_19.Still004.jpg |
| Banqueting Room of the Adelaide Town Hall, June 2026 (DSCF7369).jpg | Yu Chu Chin | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Banqueting_Room_of_the_Adelaide_Town_Hall,_June_2026_(DSCF7369).jpg |
| Restaurant in Place D'Youville, Quebec City.jpg | Wilfredor | CC0 | https://commons.wikimedia.org/wiki/File:Restaurant_in_Place_D%27Youville,_Quebec_City.jpg |
| Restaurant Näsinneula.jpg | kallerna | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Restaurant_N%C3%A4sinneula.jpg |
| Restaurant interior - geograph.org.uk - 6262847.jpg | Bob Harvey | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Restaurant_interior_-_geograph.org.uk_-_6262847.jpg |
| Interior of a Chinese restaurant in Kolkata.jpg | Kritzolina | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Interior_of_a_Chinese_restaurant_in_Kolkata.jpg |
