import User from "../models/User";
import Video from "../models/Video";
import bcrypt from "bcrypt";
import fetch from "node-fetch";
import { token } from "morgan";

export const getJoin = (req, res) => res.render("join", { pageTitle: "Join" });

export const postJoin = async (req, res) => {
	console.log(req.body);
	const { name, username, email, password, password2, location } = req.body;
	console.log(username);
	const pageTitle = "Join";
	if (password !== password2) {
		return res.status(400).render("join", {
			pageTitle,
			errorMessage: "Password confirmation does not match",
		});
	}
	const exists = await User.exists({ $or: [{ username }, { email }] });
	if (exists) {
		return res.status(400).render("join", {
			pageTitle,
			errorMessage: "This username, email is already taken.",
		});
	}
	try {
		await User.create({
			name,
			username,
			email,
			password,
			location,
		});
		return res.redirect("/login");
	} catch (error) {
		return res.render("join", {
			pageTitle: "Error",
			errorMessage: "Error",
		});
	}
};

export const getLogin = (req, res) =>
	res.render("login", { pageTitle: "Login" });

export const postLogin = async (req, res) => {
	const { username, password } = req.body;
	const pageTitle = "Login";
	const user = await User.findOne({ username, socialOnly: false });
	if (!user) {
		return res.status(400).render("login", {
			pageTitle,
			errorMessage: "Username does not exist",
		});
	}
	const ok = await bcrypt.compare(password, user.password);
	if (!ok) {
		return res.status(400).render("login", {
			pageTitle,
			errorMessage: "Wrong password",
		});
	}
	req.session.loggedIn = true;
	req.session.user = user;
	return res.redirect("/");
};

export const startGithubLogin = (req, res) => {
	const baseUrl = "https://github.com/login/oauth/authorize";
	const config = {
		client_id: process.env.GH_CLIENT,
		allow_signup: false,
		scope: "read:user user:email",
	};
	const params = new URLSearchParams(config).toString();
	const finalUrl = `${baseUrl}?${params}`;
	return res.redirect(finalUrl);
};

export const finishGithubLogin = async (req, res) => {
	const baseUrl = "https://github.com/login/oauth/access_token";
	const config = {
		client_id: process.env.GH_CLIENT,
		client_secret: process.env.GH_SECRET,
		code: req.query.code,
	};
	const params = new URLSearchParams(config).toString();
	const finalUrl = `${baseUrl}?${params}`;
	const tokenRequest = await (
		await fetch(finalUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
			},
		})
	).json();
	if ("access_token" in tokenRequest) {
		const { access_token } = tokenRequest;
		const apiUrl = "https://api.github.com";
		const userData = await (
			await fetch(`${apiUrl}/user`, {
				headers: {
					Authorization: `token ${access_token}`,
				},
			})
		).json();
		const emailData = await (
			await fetch(`${apiUrl}/user/emails`, {
				headers: {
					Authorization: `token ${access_token}`,
				},
			})
		).json();
		const emailObj = emailData.find(
			(email) => email.primary === true && email.verified === true
		);
		let user = await User.findOne({ email: emailObj.email });
		if (!user) {
			user = await User.create({
				avatarUrl: userData.avatar_url,
				name: userData.name,
				username: userData.login,
				email: emailObj.email,
				socialOnly: true,
				password: "",
				loaction: userData.location,
			});
		}
		req.session.loggedIn = true;
		req.session.user = user;
		return res.redirect("/");
	} else {
		return res.redirect("/login");
	}
};

export const getEdit = (req, res) => {
	return res.render("edit-profile", { pageTitle: "Edit Profile" });
};

export const postEdit = async (req, res) => {
	const {
		session: {
			user: { _id, avatarUrl, email: sessionEmail, username: sessionUsername },
		},
		body: { name, email, username, location },
		file,
	} = req;
	let serachParam = [];
	if (sessionEmail !== email) {
		serachParam.push({ email });
	}
	if (sessionUsername !== username) {
		serachParam.push({ username });
	}
	if (serachParam.length > 0) {
		const foundUser = await User.findOne({ $or: serachParam });
		if (foundUser && foundUser._id.toString() !== _id) {
			return res.status(400).render("edit-profile", {
				pageTitle: "Edit Profile",
				errorMessage: "This username/email is already taken.",
			});
		}
	}
	console.log(file);
	const updatedUser = await User.findByIdAndUpdate(
		_id,
		{
			avatarUrl: file ? file.path : avatarUrl,
			name,
			email,
			username,
			location,
		},
		{ new: true }
	);
	req.session.user = updatedUser;
	return res.redirect("/users/edit");
};

export const logout = (req, res) => {
	req.session.destroy();
	return res.redirect("/");
};

export const getChangePassword = (req, res) => {
	if (req.session.user.socialOnly === true) {
		res.redirect("/");
	}
	return res.render("users/change-password", { pageTitle: "Change Password" });
};
export const postChangePassword = async (req, res) => {
	const {
		session: {
			user: { _id },
		},
		body: { oldPassword, newPassword, newPasswordConfirmation },
	} = req;
	const user = await User.findById(_id);
	const ok = await bcrypt.compare(oldPassword, user.password);
	if (!ok) {
		return res.status(400).render("users/change-password", {
			pageTitle: "Change Password",
			errorMessage: "The current password is incorrect",
		});
	}
	if (newPassword !== newPasswordConfirmation) {
		return res.status(400).render("users/change-password", {
			pageTitle: "Change Password",
			errorMessage: "The new password does not match the confirmation",
		});
	}
	user.password = newPassword;
	await user.save();
	return res.redirect("/users/logout");
};

export const see = async (req, res) => {
	const { id } = req.params;
	const user = await User.findById(id).populate("videos");
	if (!user) {
		return res.status(404).render("404", { pageTitle: "404 Not Found" });
	}
	return res.render("users/profile", {
		pageTitle: `${user.username}`,
		user,
	});
};
