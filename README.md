# Portfolio Management Backend 🚀

> **Portfolio Project** - Backend API for the Dynamic Portfolio Generator, showcasing server-side development skills with Node.js, Express, Firebase, and Cloudinary.

**🌐 Frontend Demo:** [https://portfolio-generator-anant.netlify.app](https://portfolio-generator-anant.netlify.app)  
**🔗 Frontend Repository:** [https://github.com/anantspatane/portfolio_generator_frontend](https://github.com/anantspatane/portfolio_generator_frontend)

This project is a robust backend application designed to manage user portfolios, ratings, and user profiles. It provides a secure and scalable API for a frontend application to create, read, update, and delete portfolio items, as well as manage user accounts and handle image uploads. The backend leverages Firebase for authentication and Firestore for data storage, ensuring a reliable and efficient experience. It also integrates with Cloudinary for image storage and management.

*Note: This backend API serves dummy data for demonstration purposes and works in conjunction with the Dynamic Portfolio Generator frontend.*

## 🔗 Related Projects

This backend serves the **Dynamic Portfolio Generator** frontend application. Together, they form a complete full-stack portfolio generation solution.

- **Frontend:** React TypeScript application with multiple portfolio templates and real-time editing
- **Backend:** This Node.js/Express API with Firebase and Cloudinary integration

## 🌟 Key Features

- **User Authentication:** Secure user authentication using Firebase ID tokens.
- **Portfolio Management:** Create, read, update, and delete portfolio items.
- **Rating and Reviews:** Allow users to rate and review portfolios.
- **User Profile Management:** Manage user profile information, including display name and photo URL.
- **Image Uploads:** Upload images to Cloudinary with user-specific folders.
- **Public Portfolios:** Allow public viewing of portfolios without authentication.
- **Filtering and Sorting:** Filter portfolios by skills, roles, and featured status.
- **Real-time Updates:** Utilizes Firestore for real-time data synchronization.
- **Secure API Endpoints:** Protected API endpoints using authentication middleware.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** Firebase Firestore
- **Authentication:** Firebase Authentication
- **Image Storage:** Cloudinary
- **Middleware:** Cors, Helmet, Morgan, Multer
- **Environment Variables:** Dotenv
- **Firebase Admin SDK:** firebase-admin

## 📦 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Firestore enabled
- Cloudinary account
- Firebase service account credentials

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/anantspatane/portfolio_generator_backend.git
    cd portfolio_generator_backend
    ```

2.  Install dependencies:

    ```bash
    npm install # or yarn install
    ```

3.  Configure environment variables:

    Create a `.env` file in the root directory and add the following environment variables:

    ```
    PORT=5000
    FRONTEND_URL=http://localhost:3000
    FIREBASE_PROJECT_ID=<your-firebase-project-id>
    FIREBASE_PRIVATE_KEY=<your-firebase-private-key>
    FIREBASE_CLIENT_EMAIL=<your-firebase-client-email>
    CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
    CLOUDINARY_API_KEY=<your-cloudinary-api-key>
    CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
    ```

    **Note:** Replace `<your-...>` with your actual credentials. Ensure that you replace escaped newline characters in `FIREBASE_PRIVATE_KEY` with actual newline characters.

### Running Locally

1.  Initialize Firebase:

    Ensure that you have properly configured your Firebase project and have downloaded your service account key.

2.  Start the server:

    ```bash
    npm run start # or yarn start
    ```

    The server will start on the port specified in your `.env` file (or 5000 by default).

## 📂 Project Structure

```
├── config/
│   ├── cloudinary.js      # Cloudinary configuration and upload functions
│   ├── firebase.js        # Firebase Admin SDK initialization
├── middleware/
│   ├── auth.js            # Authentication middleware
├── routes/
│   ├── portfolios.js      # API routes for portfolios (protected)
│   ├── public-portfolios.js # API routes for public portfolios (unprotected)
│   ├── ratings.js         # API routes for ratings
│   ├── users.js           # API routes for user profiles
├── server.js              # Main entry point for the backend application
├── .env                   # Environment variables (API keys, etc.)
├── package.json           # Project dependencies and scripts
└── README.md              # Project documentation
```

## 🔌 API Endpoints

### Public Endpoints (No Authentication Required)
- `GET /api/public-portfolios` - Get all public portfolios
- `GET /api/public-portfolios/:id` - Get a specific public portfolio

### Protected Endpoints (Authentication Required)
All protected endpoints require a valid Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase_id_token>
```

#### Portfolio Management
- `GET /api/portfolios` - Get user's portfolios
- `POST /api/portfolios` - Create a new portfolio
- `PUT /api/portfolios/:id` - Update a portfolio
- `DELETE /api/portfolios/:id` - Delete a portfolio

#### User Profile Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

#### Rating System
- `GET /api/ratings/:portfolioId` - Get ratings for a portfolio
- `POST /api/ratings` - Add a rating to a portfolio

#### Image Upload
- `POST /api/upload` - Upload images to Cloudinary

## 💾 Data Models

### Portfolio
```javascript
{
  id: string,
  userId: string,
  template: 'modern' | 'creative',
  personalInfo: {
    name: string,
    title: string,
    bio: string,
    profileImage: string
  },
  skills: string[],
  projects: Project[],
  testimonials: Testimonial[],
  contact: ContactInfo,
  isPublic: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Rating
```javascript
{
  id: string,
  portfolioId: string,
  userId: string,
  rating: number (1-5),
  comment: string,
  createdAt: timestamp
}
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and commit them with descriptive messages.
4.  Push your changes to your fork.
5.  Submit a pull request.

## 📝 License

This project is licensed under the [MIT License](LICENSE).

## 📬 Contact

If you have any questions or suggestions, feel free to contact me at [anantpatane.github@gmail.com](mailto:anantpatane.github@gmail.com)

---

*This is a portfolio project created to demonstrate backend development skills using Node.js, Express, Firebase, Cloudinary, and RESTful API design. It serves as the backend for the Dynamic Portfolio Generator frontend application.*
