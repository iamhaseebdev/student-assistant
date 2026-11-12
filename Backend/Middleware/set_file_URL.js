function fileUrl(req, res, next) {
    if (req.file) {
        const filename = req.file.filename;
        const file_Url = `${req.protocol}://${req.get('host')}/Uploads/${filename}`;
        req.body.file_Url = [file_Url];
    }
    next();
}

export default fileUrl;