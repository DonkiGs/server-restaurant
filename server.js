const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const axios = require('axios');

const app = express();
const port = 3000;

const connection = mysql.createConnection({
    host: 'server4.hosting.reg.ru',
    user: 'u1740610_donkig',
    password: '2020034806163D',
    database: 'u1740610_donkig'
});

app.use(bodyParser.json());

connection.connect((err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err);
        return;
    }
    console.log('Подключено к базе данных MySQL');
});

app.post('/login', (req, res) => {
    const { login, password } = req.body;

    const query = 'SELECT employee_id, CONCAT( surname, " ", first_name, " ", patronymic) AS FIO, role_id FROM employees WHERE login = ? AND password = ?';
    connection.query(query, [login, password], (error, results, fields) => {
        if (error) {
            console.error('Ошибка выполнения запроса:', error);
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (results.length > 0) {
            const employee_id = results[0].employee_id;
            const FIO = results[0].FIO;
            const role_id = results[0].role_id;

            if (role_id === 2) {
                res.status(200).json({ FIO, employee_id });
            } else {
                res.status(403).send('Вы не являетесь официантом');
            }
        } else {
            res.status(401).send('Неверный логин или пароль');
        }
    });
});

app.get('/tables/select/:tableId', (req, res) => {
    const tableId = req.params.tableId;

    const selectQuery = 'SELECT table_employee_id FROM tables WHERE table_id = ?';
    connection.query(selectQuery, [tableId], (selectError, selectResults, selectFields) => {
        if (selectError) {
            console.error('Ошибка выполнения запроса SELECT:', selectError);
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (selectResults.length === 0) {
            res.status(404).send('Таблица не найдена');
            return;
        }

        const currentEmployeeId = selectResults[0].table_employee_id;
        res.status(200).json({ table_employee_id: currentEmployeeId });
    });
});

app.put('/tables/update/:tableId', (req, res) => {
    const tableId = req.params.tableId;
    const { employee_id } = req.body;

    const updateQuery = 'UPDATE tables SET table_employee_id = ? WHERE table_id = ?';
    connection.query(updateQuery, [employee_id, tableId], (updateError, updateResults, updateFields) => {
        if (updateError) {
            console.error('Ошибка выполнения запроса UPDATE:', updateError);
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (updateResults.affectedRows > 0) {
            res.status(200).send('Таблица успешно обновлена');
        } else {
            res.status(404).send('Таблица не найдена');
        }
    });
});

app.delete('/tables/update_occupied/:tableId', (req, res) => {
    const tableId = req.params.tableId;

    const updateQuery = 'UPDATE tables SET table_employee_id = NULL WHERE table_id = ?';
    connection.query(updateQuery, [tableId], (updateError, updateResults, updateFields) => {
        if (updateError) {
            console.error('Ошибка выполнения запроса UPDATE:', updateError);
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (updateResults.affectedRows > 0) {
            res.status(200).send('Пользователь снят со стола');
        } else {
            res.status(404).send('Таблица не найдена');
        }
    });
});

app.get('/tables/my_tables', (req, res) => {
    const { employee_id } = req.query;

    const query = `SELECT table_id FROM tables WHERE table_employee_id = ${employee_id}`;
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Ошибка выполнения запроса:', error);
            res.status(500).send('Ошибка сервера');
            return;
        }

        const availableTables = results.map((table) => table.table_id);

        res.status(200).send(availableTables);
    });
});

app.get('/order_id', (req, res) => {
    const { table_id } = req.query;

    const query = `SELECT order_id FROM orders WHERE table_id = ${table_id} AND order_status = "Активен"`;
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Ошибка выполнения запроса:', error);
            res.status(500);
            return;
        }

        if (results.length === 0) {
            res.status(404);
            return;
        }

        const order_id = results[0].order_id;

        res.status(200).json({ order_id });
    });
});

app.post('/orders/create', (req, res) => {
    const { transformedProducts, parsedTableNumber } = req.body;

    // Получение order_id из базы данных
    axios.get(`http://192.168.0.102:3000/order_id?table_id=${req.body.parsedTableNumber}`)
        .then((response) => {
            const order_id = response.data.order_id;

            const createOrderItemsQuery = 'INSERT INTO order_items (order_id, dish_id, item_quantity, item_price) VALUES (?, ?, ?, ?)';
            const orderItemsPromises = transformedProducts.map((orderItem) => {
                const { dish_id, item_quantity, item_price } = orderItem;
                return new Promise((resolve, reject) => {
                    connection.query(createOrderItemsQuery, [order_id, dish_id, item_quantity, item_price], (error, orderItemResults) => {
                        if (error) {
                            console.error('Ошибка при создании записи в таблице "order_items":', error);
                            reject(error);
                        } else {
                            resolve(orderItemResults);
                        }
                    });
                });
            });

            Promise.all(orderItemsPromises)
                .then(() => {
                    const updateOrderStatusQuery = `UPDATE orders SET order_status = 'Закрыт' WHERE table_id = ${parsedTableNumber}`;
                    connection.query(updateOrderStatusQuery, (error, updateResults) => {
                        if (error) {
                            console.error('Ошибка при обновлении статуса заказа:', error);
                            res.status(500).json({ error: 'Ошибка при обновлении статуса заказа' });
                        } else {
                            console.log('Заказ успешно создан');
                            res.status(200).json({ message: 'Заказ успешно создан' });
                        }
                    });
                })
                .catch((error) => {
                    console.error('Ошибка при создании записи в таблице "order_items":', error);
                    res.status(500).json({ error: 'Ошибка при создании записи в таблице "order_items"' });
                });
        })
        .catch((error) => {
            console.error('Ошибка при получении order_id:', error);
            res.status(500).json({ error: 'Ошибка при получении order_id' });
        });
});

app.get('/tables/occupied', (req, res) => {
    const { employee_id } = req.query;

    const query = `SELECT table_id, table_employee_id FROM tables`;
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Ошибка выполнения запроса:', error);
            res.status(500).send('Ошибка сервера');
            return;
        }

        const occupiedTables = results.map((table) => ({
            table_employee_id: table.table_employee_id,
            table_id: table.table_id,
            isOccupied: table.hasOwnProperty('table_employee_id') && table.table_employee_id !== null && table.table_employee_id !== employee_id,
        }));

        res.status(200).send(occupiedTables);
    });
});

app.get('/orders/status/:tableId', (req, res) => {
    const tableId = req.params.tableId;

    // Запрос к базе данных для получения статуса заказа
    const query = `SELECT order_status FROM orders WHERE table_id = ? AND order_status = 'Активен'`;
    connection.query(query, [tableId], (err, results) => {
        if (err) {
            console.error('Ошибка при выполнении запроса:', err);
            res.status(500).json({ error: 'Внутренняя ошибка сервера' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ error: 'Заказ не найден' });
            return;
        }

        const orderStatus = results[0].order_status;
        res.json({ order_status: orderStatus });
    });
});

app.post('/orders', (req, res) => {
    const { table_id, order_date, order_status, employee_id } = req.body;

    const query = 'INSERT INTO orders (table_id, order_date, order_status, employee_id) VALUES (?, ?, ?, ?)';
    connection.query(query, [table_id, order_date, order_status, employee_id], (error, results) => {
        if (error) {
            console.error('Ошибка при создании заказа:', error);
            res.status(500).json({ error: 'Ошибка при создании заказа' });
        } else {
            console.log('Заказ успешно создан');
            res.status(200).json({ message: 'Заказ успешно создан' });
        }
    });
});


app.get('/dishes', (req, res) => {
    const query = 'SELECT dish_id, dish_photo, dish_price, dish_name FROM dishes';

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Ошибка при выполнении запроса:', err);
            res.status(500).send('Ошибка сервера');
        } else {
            const productsWithImages = results.map((product) => {
                const imageSource = product.dish_photo; // Используем URI напрямую
                return {
                    ...product,
                    imageSource,
                };
            });
            res.json(productsWithImages);
        }
    });
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});