# Screenshots
* Browser screenshots are JPEG: use `.jpg` and `image/jpeg`.
* If you take a screenshot that the user should see, include the image inline in your Markdown response using Markdown image syntax so the image renders, rather than as a bare link:
  ```md
  ![screenshot](IMAGE_LINK)
  ```
  For `IMAGE_LINK`, follow the active runtime’s shared-file guidance and use the reference returned by the file delivery tool when available.
  If the chat renders images by workspace path, verify that the chat executor can read the JPEG before embedding its absolute path.
* IMPORTANT: If the user has asked you to take screenshots, you MUST include them as part of your final markdown response.
* If the user has asked you to test a website as part of development, you should take screenshots at key moments and include them in your final response.
