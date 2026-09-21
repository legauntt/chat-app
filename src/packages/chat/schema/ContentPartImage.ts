export default interface ContentPartImage {
  type: 'image_url';
  image_url: {
    url: string;
    details?: string;
  };
}
