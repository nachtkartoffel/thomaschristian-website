function scrollVideo() {
  var video = $('#video').get(0),
    videoLength = video.duration,
    scrollPosition = $(document).scrollTop();
  
  video.currentTime = (scrollPosition / ($(document).height() - $(window).height())) * videoLength;
}

$(window).scroll(function(e) {
  scrollVideo();
});