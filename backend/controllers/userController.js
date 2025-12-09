const User = require('../models/user');

exports.getUsers = async (req, res) => {
    const users = await User.find();
    res.render('users', { users });
};

exports.createUser = async (req, res) => {
    const newUser = new User(req.body);
    await newUser.save();
    res.redirect('/users');
};
